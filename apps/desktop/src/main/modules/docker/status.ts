// Sockets and CLI paths only exist on macOS/Linux: always build POSIX paths.
import { posix } from 'node:path';

import type { DockerState } from '@kestrel/shared';

/**
 * Where the Docker socket can be on macOS and Linux: the default, Docker
 * Desktop's per-user socket, rootless Docker, Colima and Rancher Desktop.
 * Returns null when DOCKER_HOST is set or on Windows (named pipe): then the
 * library's own default applies.
 */
export function dockerSocketCandidates(
  platform: NodeJS.Platform,
  home: string,
  env: Readonly<Record<string, string | undefined>>,
): string[] | null {
  if (env['DOCKER_HOST'] || platform === 'win32') return null;
  const candidates = ['/var/run/docker.sock'];
  if (platform === 'darwin') candidates.push(posix.join(home, '.docker/run/docker.sock'));
  const runtimeDir = env['XDG_RUNTIME_DIR'];
  if (platform === 'linux' && runtimeDir) candidates.push(posix.join(runtimeDir, 'docker.sock'));
  candidates.push(
    posix.join(home, '.docker/desktop/docker.sock'),
    posix.join(home, '.colima/default/docker.sock'),
    posix.join(home, '.rd/docker.sock'),
  );
  return candidates;
}

/** Typical install locations of the Docker CLI / Docker Desktop. */
export function dockerInstallPaths(
  platform: NodeJS.Platform,
  env: Readonly<Record<string, string | undefined>>,
): string[] {
  if (platform === 'win32') {
    const programFiles = env['ProgramFiles'] ?? 'C:\\Program Files';
    return [`${programFiles}\\Docker\\Docker\\Docker Desktop.exe`];
  }
  const paths = ['/usr/bin/docker', '/usr/local/bin/docker', '/opt/homebrew/bin/docker'];
  if (platform === 'darwin') paths.push('/Applications/Docker.app');
  for (const dir of (env['PATH'] ?? '').split(':')) if (dir) paths.push(posix.join(dir, 'docker'));
  return paths;
}

/**
 * Turns a failed connection into a state the user can act on:
 * no access -> "noPermission"; socket missing or refused -> "notRunning"
 * when Docker is installed, else "notInstalled".
 */
export function classifyDockerError(error: unknown, installed: boolean): DockerState {
  const code = (error as { code?: unknown } | null)?.code;
  if (code === 'EACCES' || code === 'EPERM') return 'noPermission';
  if (code === 'ENOENT' || code === 'ECONNREFUSED' || code === 'ECONNRESET') {
    return installed ? 'notRunning' : 'notInstalled';
  }
  return 'error';
}
