import { describe, expect, it, vi } from 'vitest';
import { dispatch } from './dispatch';
import { UserError } from './errors';
import type { IpcContext, IpcHandlers } from './handlers';
import { ipcChannels } from '@kestrel/shared';

// Handlers under test never touch the sender.
const context = { sender: {} } as IpcContext;

const info = { name: 'Hoverwing', version: '0.0.0', platform: 'linux', locale: 'de' } as const;

function makeHandlers(overrides: Partial<IpcHandlers> = {}): IpcHandlers {
  const unused = Object.fromEntries(
    ipcChannels.map((channel) => [
      channel,
      () => {
        throw new Error(`${channel} is not stubbed`);
      },
    ]),
  );
  // Test-only: every channel gets a stub, the ones under test are overridden.
  return { ...unused, 'app:getInfo': () => info, ...overrides } as IpcHandlers;
}

describe('dispatch', () => {
  it('returns handler data for a valid request', async () => {
    await expect(dispatch(makeHandlers(), 'app:getInfo', undefined, context)).resolves.toEqual({
      ok: true,
      data: info,
    });
  });

  it('rejects unknown channels', async () => {
    const result = await dispatch(makeHandlers(), 'shell:exec', 'rm -rf /', context);
    expect(result).toEqual({
      ok: false,
      error: { code: 'unknown_channel', message: 'Unknown IPC channel.' },
    });
  });

  it('rejects invalid payloads', async () => {
    const result = await dispatch(makeHandlers(), 'app:getInfo', { unexpected: true }, context);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe('invalid_request');
  });

  it('passes user-facing error codes through', async () => {
    const handlers = makeHandlers({
      'app:getInfo': () => {
        throw new UserError('not_found', 'File or folder not found.');
      },
    });
    const result = await dispatch(handlers, 'app:getInfo', undefined, context);
    expect(result).toEqual({
      ok: false,
      error: { code: 'not_found', message: 'File or folder not found.' },
    });
  });

  it('maps file system errors without leaking paths', async () => {
    const handlers = makeHandlers({
      'app:getInfo': () => {
        throw Object.assign(new Error("EEXIST: file already exists, open '/home/me/x'"), {
          code: 'EEXIST',
        });
      },
    });
    const result = await dispatch(handlers, 'app:getInfo', undefined, context);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('already_exists');
      expect(result.error.message).not.toContain('/home');
    }
  });

  it('hides internal error details from the renderer', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const handlers = makeHandlers({
      'app:getInfo': () => {
        throw new Error('secret path /home/user/.ssh');
      },
    });
    const result = await dispatch(handlers, 'app:getInfo', undefined, context);
    expect(result).toEqual({
      ok: false,
      error: { code: 'internal', message: 'app:getInfo failed.' },
    });
  });
});
