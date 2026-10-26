import { createHash } from 'node:crypto';
import { createWriteStream } from 'node:fs';
import { mkdir, rm } from 'node:fs/promises';
import { dirname } from 'node:path';
import { z } from 'zod';
import { byteReader } from '../../lib/bytes';
import type { InstallPlan } from '@kestrel/shared';
import { UserError } from '../../ipc/errors';

export const OLLAMA_RELEASE_API = 'https://api.github.com/repos/ollama/ollama/releases/latest';

/** Downloads come only from the official GitHub releases (and their file hosts). */
export const DOWNLOAD_HOSTS: readonly string[] = [
  'api.github.com',
  'github.com',
  'objects.githubusercontent.com',
  'release-assets.githubusercontent.com',
];

export function isAllowedDownloadUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'https:' && DOWNLOAD_HOSTS.includes(parsed.hostname);
  } catch {
    return false;
  }
}

const releaseSchema = z.object({
  tag_name: z.string(),
  html_url: z.string(),
  assets: z.array(
    z.object({
      name: z.string(),
      size: z.number(),
      browser_download_url: z.string(),
      digest: z.string().nullable().optional(),
    }),
  ),
});

/** The installer file of the official release for this system. */
export function installerAsset(platform: NodeJS.Platform): string | null {
  if (platform === 'win32') return 'OllamaSetup.exe';
  if (platform === 'darwin') return 'Ollama.dmg';
  // Linux: the official install script needs root; the UI explains it instead.
  return null;
}

/** Reads the latest official release and picks the installer with its SHA-256. */
export async function ollamaInstallPlan(
  platform: NodeJS.Platform,
  fetchJson: (url: string) => Promise<unknown>,
): Promise<InstallPlan | null> {
  const name = installerAsset(platform);
  if (!name) return null;
  let release: z.infer<typeof releaseSchema>;
  try {
    release = releaseSchema.parse(await fetchJson(OLLAMA_RELEASE_API));
  } catch {
    throw new UserError('download_failed', 'The release information could not be loaded.');
  }
  const asset = release.assets.find((entry) => entry.name === name);
  const sha256 = /^sha256:([a-f0-9]{64})$/.exec(asset?.digest ?? '')?.[1];
  // Without a published checksum nothing is downloaded.
  if (!asset || !sha256 || !isAllowedDownloadUrl(asset.browser_download_url)) return null;
  return {
    version: release.tag_name,
    fileName: asset.name,
    url: asset.browser_download_url,
    source: release.html_url,
    sizeBytes: asset.size,
    sha256,
  };
}

/**
 * Downloads a file and checks its SHA-256 while writing. A wrong checksum
 * or a redirect to an unknown host deletes the file and fails.
 */
export async function downloadVerified(
  plan: Pick<InstallPlan, 'url' | 'sha256' | 'sizeBytes'>,
  destination: string,
  onProgress: (completed: number, total: number) => void,
  signal: AbortSignal,
  fetchImpl: typeof fetch = fetch,
): Promise<void> {
  if (!isAllowedDownloadUrl(plan.url)) {
    throw new UserError('download_failed', 'Download address is not an official source.');
  }
  const response = await fetchImpl(plan.url, { signal, redirect: 'follow' });
  if (!response.ok || !response.body) {
    throw new UserError('download_failed', `Download failed: HTTP ${String(response.status)}`);
  }
  if (response.url && !isAllowedDownloadUrl(response.url)) {
    throw new UserError('download_failed', 'Download was redirected to an unknown host.');
  }
  await mkdir(dirname(destination), { recursive: true });
  const hash = createHash('sha256');
  const file = createWriteStream(destination);
  let completed = 0;
  const reader = byteReader(response.body);
  try {
    for (;;) {
      const { done, value: chunk } = await reader.read();
      if (done) break;
      hash.update(chunk);
      completed += chunk.byteLength;
      if (!file.write(chunk)) {
        await new Promise<void>((resolve) => {
          file.once('drain', () => {
            resolve();
          });
        });
      }
      onProgress(completed, plan.sizeBytes);
    }
    await new Promise<void>((resolve, reject) => {
      file.end((error?: Error | null) => {
        if (error) reject(error);
        else resolve();
      });
    });
  } catch (error) {
    file.destroy();
    await rm(destination, { force: true });
    throw error;
  }
  if (hash.digest('hex') !== plan.sha256) {
    await rm(destination, { force: true });
    throw new UserError('download_corrupt', 'Checksum mismatch: the download was deleted.');
  }
}
