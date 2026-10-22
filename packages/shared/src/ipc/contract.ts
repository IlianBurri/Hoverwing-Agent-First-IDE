import type { z } from 'zod';
import { appChannels } from './channels/app';
import { searchChannels } from './channels/search';
import { settingsChannels, settingsEvents } from './channels/settings';
import { windowChannels } from './channels/window';
import { workspaceChannels, workspaceEvents } from './channels/workspace';

/**
 * Single source of truth for every IPC channel and event.
 *
 * Channels (renderer -> main, request/response) declare a zod schema for
 * request and response. The main process validates incoming requests against
 * `request`; TypeScript types for preload and renderer derive from the same
 * schemas. Events (main -> renderer) declare a schema for their payload.
 *
 * Channels are defined per module in ./channels and merged here.
 *
 * Rule: no generic channels (e.g. "run arbitrary command"). One channel per
 * concrete, narrow action.
 */
export const ipcContract = {
  ...appChannels,
  ...searchChannels,
  ...settingsChannels,
  ...windowChannels,
  ...workspaceChannels,
} as const satisfies Record<string, { request: z.ZodType; response: z.ZodType }>;

export const ipcEvents = {
  ...settingsEvents,
  ...workspaceEvents,
} as const satisfies Record<string, z.ZodType>;

export type IpcContract = typeof ipcContract;
export type IpcChannel = keyof IpcContract;
export type IpcRequest<C extends IpcChannel> = z.infer<IpcContract[C]['request']>;
export type IpcResponse<C extends IpcChannel> = z.infer<IpcContract[C]['response']>;

export type IpcEvents = typeof ipcEvents;
export type IpcEvent = keyof IpcEvents;
export type IpcEventPayload<E extends IpcEvent> = z.infer<IpcEvents[E]>;

export const ipcChannels = Object.keys(ipcContract) as IpcChannel[];
export const ipcEventNames = Object.keys(ipcEvents) as IpcEvent[];

export function isIpcChannel(value: unknown): value is IpcChannel {
  return typeof value === 'string' && Object.hasOwn(ipcContract, value);
}

export function isIpcEvent(value: unknown): value is IpcEvent {
  return typeof value === 'string' && Object.hasOwn(ipcEvents, value);
}
