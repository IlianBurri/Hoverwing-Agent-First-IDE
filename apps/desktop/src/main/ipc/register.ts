import { ipcMain } from 'electron';
import type { IpcMainInvokeEvent } from 'electron';
import { IPC_INVOKE_CHANNEL } from '../../preload/api';
import { dispatch } from './dispatch';
import type { IpcHandlers } from './handlers';

/**
 * Registers the single invoke entry point. Requests are only accepted from
 * the app's own top-level frame.
 */
export function registerIpc(
  handlers: IpcHandlers,
  isTrustedSender: (url: string) => boolean,
): void {
  ipcMain.handle(
    IPC_INVOKE_CHANNEL,
    (event: IpcMainInvokeEvent, channel: unknown, payload: unknown) => {
      const frameUrl = event.senderFrame?.url ?? '';
      if (event.senderFrame?.parent !== null || !isTrustedSender(frameUrl)) {
        return { ok: false, error: { code: 'unknown_channel', message: 'Untrusted sender.' } };
      }
      return dispatch(handlers, channel, payload);
    },
  );
}
