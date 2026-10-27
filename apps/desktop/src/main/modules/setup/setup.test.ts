import { createHash } from 'node:crypto';
import { mkdtemp, readFile, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, win32 } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { defaultSettings } from '@kestrel/shared';
import type { InstallPlan, ProviderConfig, Settings } from '@kestrel/shared';
import { CatalogStore, defaultCatalog } from './catalog';
import { detectBackend, detectHardware, toGpus } from './hardware';
import type { SystemInfo } from './hardware';
import { downloadVerified, isAllowedDownloadUrl, ollamaInstallPlan } from './installer';
import { ollamaApi } from './ollama';
import type { OllamaApi } from './ollama';
import { LOCAL_PROVIDER_ID, SetupService } from './service';

let dir: string;

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'kestrel-setup-'));
});

afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

const GB = 1024 ** 3;

function fakeSi(
  controllers: Awaited<ReturnType<SystemInfo['graphics']>>['controllers'],
): SystemInfo {
  return {
    graphics: () => Promise.resolve({ controllers }),
    mem: () => Promise.resolve({ total: 32 * GB }),
    cpu: () =>
      Promise.resolve({ manufacturer: 'Intel', brand: 'Core Ultra 7', cores: 8, physicalCores: 8 }),
    osInfo: () =>
      Promise.resolve({ platform: 'Windows', distro: 'Windows 11', release: '10.0', arch: 'x64' }),
    fsSize: () =>
      Promise.resolve([
        { mount: 'C:', available: 300 * GB },
        { mount: 'D:', available: 10 * GB },
      ]),
  };
}

describe('hardware detection', () => {
  it('keeps real GPUs and marks integrated ones as shared', () => {
    const gpus = toGpus([
      {
        vendor: 'Intel Corporation',
        model: 'Intel(R) Arc(TM) 140V GPU',
        vram: 2048,
        vramDynamic: true,
      },
      { vendor: 'NVIDIA', model: 'GeForce RTX 4070', vram: 12_288, vramDynamic: false },
      {
        vendor: 'Microsoft',
        model: 'Microsoft Basic Display Adapter',
        vram: 0,
        vramDynamic: false,
      },
    ]);
    expect(gpus).toEqual([
      {
        vendor: 'Intel Corporation',
        model: 'Intel(R) Arc(TM) 140V GPU',
        vramBytes: 2 * GB,
        shared: true,
      },
      { vendor: 'NVIDIA', model: 'GeForce RTX 4070', vramBytes: 12 * GB, shared: false },
    ]);
  });

  it('picks the backend from GPU and installed drivers', async () => {
    const nvidia = [{ vendor: 'NVIDIA', model: 'RTX', vramBytes: 8 * GB, shared: false }];
    const base = {
      platform: 'win32' as const,
      arch: 'x64',
      env: { PATH: 'C:\\bin', SystemRoot: 'C:\\Windows' },
    };
    const withFiles = (files: string[]) => ({
      ...base,
      exists: (path: string) => Promise.resolve(files.includes(path)),
    });
    expect(await detectBackend(nvidia, withFiles([win32.join('C:\\bin', 'nvidia-smi.exe')]))).toBe(
      'cuda',
    );
    expect(
      await detectBackend(
        nvidia,
        withFiles([win32.join('C:\\Windows', 'System32', 'vulkan-1.dll')]),
      ),
    ).toBe('vulkan');
    expect(await detectBackend(nvidia, withFiles([]))).toBe('cpu');
    expect(await detectBackend([], { ...withFiles([]), platform: 'darwin', arch: 'arm64' })).toBe(
      'metal',
    );
  });

  it('reports the free space of the home drive', async () => {
    const info = await detectHardware({
      si: fakeSi([]),
      platform: 'win32',
      arch: 'x64',
      env: {},
      homeDir: 'C:\\Users\\me',
      exists: () => Promise.resolve(false),
    });
    expect(info.diskFreeBytes).toBe(300 * GB);
    expect(info.ramBytes).toBe(32 * GB);
    expect(info.backend).toBe('cpu');
  });
});

describe('catalog', () => {
  it('ships a valid catalog with models for both purposes', () => {
    expect(defaultCatalog.models.some((model) => model.purpose === 'completion')).toBe(true);
    expect(defaultCatalog.models.some((model) => model.purpose === 'chat')).toBe(true);
  });

  it('keeps a downloaded catalog only if it is newer', async () => {
    const newer = { ...defaultCatalog, version: defaultCatalog.version + 1, models: [] };
    const store = new CatalogStore(dir, () => Promise.resolve(JSON.stringify(newer)));
    expect(await store.update()).toEqual({ updated: true, catalog: newer });
    const reloaded = new CatalogStore(dir, () => Promise.reject(new Error('offline')));
    expect((await reloaded.get()).version).toBe(newer.version);
    const same = new CatalogStore(dir, () => Promise.resolve(JSON.stringify(defaultCatalog)));
    expect((await same.update()).updated).toBe(false);
  });

  it('rejects invalid downloads', async () => {
    const store = new CatalogStore(dir, () => Promise.resolve('{"version":"x"}'));
    await expect(store.update()).rejects.toMatchObject({ code: 'download_failed' });
  });
});

const sha = (text: string) => createHash('sha256').update(text).digest('hex');

function release(digest: string | null) {
  return {
    tag_name: 'v1.2.3',
    html_url: 'https://github.com/ollama/ollama/releases/tag/v1.2.3',
    assets: [
      {
        name: 'OllamaSetup.exe',
        size: 5,
        browser_download_url:
          'https://github.com/ollama/ollama/releases/download/v1.2.3/OllamaSetup.exe',
        digest,
      },
    ],
  };
}

describe('installer', () => {
  it('only plans downloads with a published checksum', async () => {
    const plan = await ollamaInstallPlan('win32', () =>
      Promise.resolve(release(`sha256:${sha('hello')}`)),
    );
    expect(plan).toMatchObject({
      version: 'v1.2.3',
      fileName: 'OllamaSetup.exe',
      sha256: sha('hello'),
    });
    expect(await ollamaInstallPlan('win32', () => Promise.resolve(release(null)))).toBeNull();
    expect(await ollamaInstallPlan('linux', () => Promise.resolve(release(null)))).toBeNull();
  });

  it('allows official hosts only', () => {
    expect(isAllowedDownloadUrl('https://github.com/ollama/ollama/x')).toBe(true);
    expect(isAllowedDownloadUrl('http://github.com/x')).toBe(false);
    expect(isAllowedDownloadUrl('https://evil.example/OllamaSetup.exe')).toBe(false);
  });

  const plan = (text: string): InstallPlan => ({
    version: 'v1',
    fileName: 'f',
    url: 'https://github.com/ollama/ollama/releases/download/v1/f',
    source: 'https://github.com/ollama/ollama',
    sizeBytes: text.length,
    sha256: sha('hello'),
  });
  const respond = (text: string, url = 'https://release-assets.githubusercontent.com/f') =>
    (() => {
      const response = new Response(text);
      Object.defineProperty(response, 'url', { value: url });
      return Promise.resolve(response);
    }) as typeof fetch;

  it('writes the file when the checksum matches', async () => {
    const file = join(dir, 'f');
    const progress = vi.fn();
    await downloadVerified(
      plan('hello'),
      file,
      progress,
      new AbortController().signal,
      respond('hello'),
    );
    expect(await readFile(file, 'utf8')).toBe('hello');
    expect(progress).toHaveBeenLastCalledWith(5, 5);
  });

  it('deletes the file when the checksum is wrong or the host is unknown', async () => {
    const file = join(dir, 'f');
    await expect(
      downloadVerified(
        plan('evil!'),
        file,
        vi.fn(),
        new AbortController().signal,
        respond('evil!'),
      ),
    ).rejects.toMatchObject({ code: 'download_corrupt' });
    await expect(stat(file)).rejects.toThrow();
    await expect(
      downloadVerified(
        plan('hello'),
        file,
        vi.fn(),
        new AbortController().signal,
        respond('hello', 'https://evil.example/f'),
      ),
    ).rejects.toMatchObject({ code: 'download_failed' });
  });
});

describe('ollama api', () => {
  it('sums the progress of all layers while pulling', async () => {
    const lines = [
      { status: 'pulling manifest' },
      { status: 'pulling', digest: 'a', total: 100, completed: 50 },
      { status: 'pulling', digest: 'b', total: 20, completed: 20 },
      { status: 'pulling', digest: 'a', total: 100, completed: 100 },
      { status: 'success' },
    ];
    const fetchImpl = (() =>
      Promise.resolve(
        new Response(lines.map((line) => JSON.stringify(line)).join('\n')),
      )) as typeof fetch;
    const progress: [number, number][] = [];
    await ollamaApi('http://x', fetchImpl).pull(
      'm',
      (completed, total) => progress.push([completed, total]),
      new AbortController().signal,
    );
    expect(progress.at(-1)).toEqual([120, 120]);
  });

  it('reports pull errors and measures tokens per second', async () => {
    const failing = (() =>
      Promise.resolve(new Response('{"error":"model not found"}\n'))) as typeof fetch;
    await expect(
      ollamaApi('http://x', failing).pull('m', vi.fn(), new AbortController().signal),
    ).rejects.toThrow('model not found');
    const generate = (() =>
      Promise.resolve(
        Response.json({ eval_count: 100, eval_duration: 2_000_000_000 }),
      )) as typeof fetch;
    expect(await ollamaApi('http://x', generate).measure('m', new AbortController().signal)).toBe(
      50,
    );
  });
});

describe('SetupService.apply', () => {
  it('adds the local provider and switches chat and completion to it', async () => {
    let settings: Settings = defaultSettings;
    const saved: ProviderConfig[] = [];
    const service = new SetupService({
      detectHardware: () => Promise.reject(new Error('unused')),
      catalog: new CatalogStore(dir, () => Promise.reject(new Error('unused'))),
      ollama: { baseUrl: 'http://127.0.0.1:11434' } as OllamaApi,
      isOllamaInstalled: () => Promise.resolve(true),
      installPlan: () => Promise.resolve(null),
      download: () => Promise.resolve(),
      launchInstaller: () => Promise.resolve(false),
      providers: {
        list: () => Promise.resolve([]),
        save: (config) => {
          saved.push(config);
          return Promise.resolve({ ...config, apiKeySet: false });
        },
      },
      settings: {
        get: () => settings,
        update: (patch) => {
          settings = { ...settings, ...patch };
          return Promise.resolve();
        },
      },
      downloadsDir: dir,
      progress: vi.fn(),
    });
    await service.apply({ completion: 'qwen2.5-coder:1.5b', chat: 'qwen2.5-coder:7b' });
    expect(saved[0]).toMatchObject({
      id: LOCAL_PROVIDER_ID,
      baseUrl: 'http://127.0.0.1:11434/v1',
      models: ['qwen2.5-coder:7b', 'qwen2.5-coder:1.5b'],
    });
    expect(settings.setupDone).toBe(true);
    expect(settings.chatModel).toEqual({
      providerId: LOCAL_PROVIDER_ID,
      model: 'qwen2.5-coder:7b',
    });
    expect(settings.completion).toMatchObject({
      enabled: true,
      model: { providerId: LOCAL_PROVIDER_ID, model: 'qwen2.5-coder:1.5b' },
    });
  });
});
