import { BrowserWindow } from 'electron';
import type { WebContents } from 'electron';
import type { IpcEvent, IpcEventPayload } from '@kestrel/shared';
import { IPC_EVENT_CHANNEL } from '../../preload/api';

/** Sends a typed event to one renderer. */
export function sendEvent<E extends IpcEvent>(
  contents: WebContents,
  event: E,
  payload: IpcEventPayload<E>,
): void {
  if (!contents.isDestroyed()) contents.send(IPC_EVENT_CHANNEL, event, payload);
}

/** Sends a typed event to every app window. */
export function broadcastEvent<E extends IpcEvent>(event: E, payload: IpcEventPayload<E>): void {
  for (const window of BrowserWindow.getAllWindows()) {
    sendEvent(window.webContents, event, payload);
  }
}
