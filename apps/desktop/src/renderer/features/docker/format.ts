import { baseName, parentPath } from '@kestrel/shared';

function slug(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, '-')
    .replace(/^[-.]+|[-.]+$/g, '');
}

/**
 * A tag for building `dockerfile` in project `projectName`:
 * "Dockerfile" -> "shop:latest", "api/Dockerfile.dev" -> "shop-api:dev".
 */
export function suggestTag(projectName: string, dockerfile: string): string {
  const folder = parentPath(dockerfile);
  const name = baseName(dockerfile);
  const variant = /^Dockerfile\.(.+)$/.exec(name)?.[1] ?? /^(.+)\.Dockerfile$/.exec(name)?.[1];
  const repository =
    [slug(projectName) || 'app', ...(folder ? [slug(baseName(folder))] : [])]
      .filter(Boolean)
      .join('-') || 'app';
  return `${repository}:${variant ? slug(variant) || 'latest' : 'latest'}`;
}

/** 1536 -> "1.5 KB", 123456789 -> "118 MB". */
export function formatBytes(bytes: number): string {
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let value = bytes;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit++;
  }
  const digits = value >= 10 || unit === 0 ? 0 : 1;
  return `${value.toFixed(digits)} ${units[unit] ?? 'B'}`;
}

/** URL to open a published port; null for ports not published on the host. */
export function portUrl(port: { publicPort: number | null; protocol: string }): string | null {
  if (port.publicPort === null || port.protocol !== 'tcp') return null;
  return `http://localhost:${String(port.publicPort)}`;
}
