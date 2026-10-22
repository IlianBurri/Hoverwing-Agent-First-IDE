import type {
  IpcChannel,
  IpcEvent,
  IpcEventPayload,
  IpcRequest,
  IpcResponse,
  IpcResult,
} from '@kestrel/shared';

/** Raw channel for renderer -> main requests. All typed channels go through it. */
export const IPC_INVOKE_CHANNEL = 'kestrel:invoke';

/** Raw channel for main -> renderer events. All typed events go through it. */
export const IPC_EVENT_CHANNEL = 'kestrel:event';

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
  /** Subscribes to a main-process event. Returns an unsubscribe function. */
  on<E extends IpcEvent>(event: E, listener: (payload: IpcEventPayload<E>) => void): () => void;
}
