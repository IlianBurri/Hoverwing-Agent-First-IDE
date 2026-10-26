import { describe, expect, it } from 'vitest';
import { toCreateOptions } from './dockerode';
import type { ContainerSpec } from './api';
import { isValidPackageName, sandboxImageTag } from './image';
import { classifyDockerError, dockerInstallPaths, dockerSocketCandidates } from './status';

describe('dockerSocketCandidates', () => {
  it('leaves DOCKER_HOST and Windows to the library', () => {
    expect(dockerSocketCandidates('linux', '/home/a', { DOCKER_HOST: 'tcp://x:2375' })).toBeNull();
    expect(dockerSocketCandidates('win32', 'C:\\Users\\a', {})).toBeNull();
  });

  it('tries the default socket first, then per-user sockets', () => {
    const mac = dockerSocketCandidates('darwin', '/Users/a', {}) ?? [];
    expect(mac[0]).toBe('/var/run/docker.sock');
    expect(mac).toContain('/Users/a/.docker/run/docker.sock');
    expect(mac).toContain('/Users/a/.colima/default/docker.sock');
    const linux = dockerSocketCandidates('linux', '/home/a', { XDG_RUNTIME_DIR: '/run/user/1000' });
    expect(linux).toContain('/run/user/1000/docker.sock');
  });
});

describe('dockerInstallPaths', () => {
  it('includes PATH entries and Docker Desktop', () => {
    expect(dockerInstallPaths('linux', { PATH: '/opt/bin:/usr/bin' })).toContain('/opt/bin/docker');
    expect(dockerInstallPaths('darwin', {})).toContain('/Applications/Docker.app');
    expect(dockerInstallPaths('win32', { ProgramFiles: 'D:\\Programs' })[0]).toContain(
      'D:\\Programs\\Docker',
    );
  });
});

describe('classifyDockerError', () => {
  it('maps socket errors to states the user can act on', () => {
    expect(classifyDockerError({ code: 'EACCES' }, true)).toBe('noPermission');
    expect(classifyDockerError({ code: 'ENOENT' }, true)).toBe('notRunning');
    expect(classifyDockerError({ code: 'ECONNREFUSED' }, false)).toBe('notInstalled');
    expect(classifyDockerError(new Error('boom'), true)).toBe('error');
  });
});

describe('sandbox image', () => {
  it('changes the tag with the base image and the packages', () => {
    const tag = sandboxImageTag('node:22-bookworm-slim', ['git']);
    expect(tag).toMatch(/^kestrel-sandbox:[0-9a-f]{12}$/);
    expect(sandboxImageTag('node:22-bookworm-slim', ['git'])).toBe(tag);
    expect(sandboxImageTag('mirror.gcr.io/library/node:22-bookworm-slim', ['git'])).not.toBe(tag);
    expect(sandboxImageTag('node:22-bookworm-slim', [])).not.toBe(tag);
  });

  it('accepts only plain package names', () => {
    expect(isValidPackageName('ca-certificates')).toBe(true);
    expect(isValidPackageName('g++')).toBe(true);
    expect(isValidPackageName('git;rm')).toBe(false);
    expect(isValidPackageName('$(x)')).toBe(false);
  });
});

describe('toCreateOptions', () => {
  const spec: ContainerSpec = {
    image: 'kestrel-sandbox:abc',
    command: ['npx', '-y', 'agent'],
    env: { HOME: '/home/kestrel', TOKEN: 'secret' },
    workingDir: '/project',
    user: '1000:1000',
    mounts: [
      { type: 'bind', source: '/project', target: '/project', readOnly: false },
      { type: 'volume', source: 'kestrel-home-a', target: '/home/kestrel' },
      { type: 'tmpfs', target: '/tmp', sizeMb: 64, mode: 0o1777 },
    ],
    labels: { 'dev.kestrel.sandbox': 'agent' },
    tty: false,
    readOnlyRootFs: true,
    memoryMb: 4096,
    cpus: 2,
    pidsLimit: 1024,
    extraHosts: ['host.docker.internal:host-gateway'],
  };

  it('hardens the container and applies the limits', () => {
    const options = toCreateOptions(spec);
    expect(options.Env).toEqual(['HOME=/home/kestrel', 'TOKEN=secret']);
    expect(options.User).toBe('1000:1000');
    expect(options.OpenStdin).toBe(true);
    expect(options.HostConfig).toMatchObject({
      AutoRemove: true,
      ReadonlyRootfs: true,
      CapDrop: ['ALL'],
      SecurityOpt: ['no-new-privileges'],
      Memory: 4096 * 1024 * 1024,
      MemorySwap: 4096 * 1024 * 1024,
      NanoCpus: 2e9,
      PidsLimit: 1024,
      ExtraHosts: ['host.docker.internal:host-gateway'],
    });
    expect(options.HostConfig?.Mounts).toEqual([
      { Type: 'bind', Source: '/project', Target: '/project', ReadOnly: false },
      { Type: 'volume', Source: 'kestrel-home-a', Target: '/home/kestrel' },
      {
        Type: 'tmpfs',
        Source: '',
        Target: '/tmp',
        TmpfsOptions: { SizeBytes: 64 * 1024 * 1024, Mode: 0o1777 },
      },
    ]);
    // No privileged mode, host network or extra devices.
    expect(options.HostConfig?.Privileged).toBeUndefined();
    expect(options.HostConfig?.NetworkMode).toBeUndefined();
    expect(options.HostConfig?.Binds).toBeUndefined();
  });

  it('leaves the user to the image when none is given', () => {
    expect(toCreateOptions({ ...spec, user: null }).User).toBeUndefined();
  });
});
