import { z } from 'zod';

/**
 * Single source of truth for every IPC channel.
 *
 * Each channel declares a zod schema for its request and response. The main
 * process validates incoming requests against `request`, and TypeScript types
 * for preload and renderer are derived from the same schemas.
 *
 * Rule: no generic channels (e.g. "run arbitrary command"). One channel per
 * concrete, narrow action.
 */
export const ipcContract = {
  'app:getInfo': {
    request: z.void(),
    response: z.object({
      name: z.string(),
      version: z.string(),
      platform: z.enum(['darwin', 'win32', 'linux', 'other']),
      locale: z.string(),
    }),
  },
} as const satisfies Record<string, { request: z.ZodType; response: z.ZodType }>;

export type IpcContract = typeof ipcContract;
export type IpcChannel = keyof IpcContract;
export type IpcRequest<C extends IpcChannel> = z.infer<IpcContract[C]['request']>;
export type IpcResponse<C extends IpcChannel> = z.infer<IpcContract[C]['response']>;

export const ipcChannels = Object.keys(ipcContract) as IpcChannel[];

export function isIpcChannel(value: unknown): value is IpcChannel {
  return typeof value === 'string' && Object.hasOwn(ipcContract, value);
}
