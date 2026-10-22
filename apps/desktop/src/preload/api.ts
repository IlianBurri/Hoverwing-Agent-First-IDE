import type { IpcChannel, IpcRequest, IpcResponse, IpcResult } from '@kestrel/shared';

/** The only raw IPC channel. All typed channels are multiplexed through it. */
export const IPC_INVOKE_CHANNEL = 'kestrel:invoke';

/** Channels without a request payload are called without an argument. */
export type IpcArgs<C extends IpcChannel> = [IpcRequest<C>] extends [undefined]
  ? []
  : [IpcRequest<C>];

/** The API exposed to the renderer as `window.kestrel`. */
export interface KestrelApi {
  invoke<C extends IpcChannel>(
    channel: C,
    ...request: IpcArgs<C>
  ): Promise<IpcResult<IpcResponse<C>>>;
}
