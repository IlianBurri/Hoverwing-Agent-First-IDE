import { describe, expect, it } from 'vitest';
import { findProgram } from './which';

const existing = (files: string[]) => (path: string) => Promise.resolve(files.includes(path));

describe('findProgram', () => {
  it('searches PATH with the Windows endings', async () => {
    const exists = existing(['C:\\node\\npx.cmd']);
    const env = { PATH: 'C:\\tools;C:\\node', PATHEXT: '.EXE;.CMD' };
    expect(await findProgram('npx', { platform: 'win32', env, exists })).toBe('C:\\node\\npx.cmd');
    expect(await findProgram('missing', { platform: 'win32', env, exists })).toBeNull();
  });

  it('checks paths directly, relative to the working folder', async () => {
    const exists = existing(['/srv/project/server.js', '/usr/bin/node']);
    const options = { platform: 'linux' as const, env: { PATH: '/usr/bin' }, exists };
    expect(await findProgram('node', options)).toBe('/usr/bin/node');
    expect(await findProgram('./server.js', { ...options, cwd: '/srv/project' })).toBe(
      '/srv/project/server.js',
    );
    expect(await findProgram('/does/not/exist', options)).toBeNull();
  });
});
