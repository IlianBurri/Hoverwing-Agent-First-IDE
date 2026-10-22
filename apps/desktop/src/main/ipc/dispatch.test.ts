import { describe, expect, it, vi } from 'vitest';
import { dispatch } from './dispatch';
import type { IpcHandlers } from './handlers';

const info = { name: 'Kestrel', version: '0.0.0', platform: 'linux', locale: 'de' } as const;

function makeHandlers(overrides: Partial<IpcHandlers> = {}): IpcHandlers {
  return { 'app:getInfo': () => info, ...overrides };
}

describe('dispatch', () => {
  it('returns handler data for a valid request', async () => {
    await expect(dispatch(makeHandlers(), 'app:getInfo', undefined)).resolves.toEqual({
      ok: true,
      data: info,
    });
  });

  it('rejects unknown channels', async () => {
    const result = await dispatch(makeHandlers(), 'shell:exec', 'rm -rf /');
    expect(result).toEqual({
      ok: false,
      error: { code: 'unknown_channel', message: 'Unknown IPC channel.' },
    });
  });

  it('rejects invalid payloads', async () => {
    const result = await dispatch(makeHandlers(), 'app:getInfo', { unexpected: true });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe('invalid_request');
  });

  it('hides internal error details from the renderer', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const handlers = makeHandlers({
      'app:getInfo': () => {
        throw new Error('secret path /home/user/.ssh');
      },
    });
    const result = await dispatch(handlers, 'app:getInfo', undefined);
    expect(result).toEqual({
      ok: false,
      error: { code: 'internal', message: 'app:getInfo failed.' },
    });
  });
});
