import type { WebContents } from 'electron';
import type { IpcChannel, IpcRequest, IpcResponse } from '@kestrel/shared';

/** Who sent the request. Handlers use it e.g. to find the calling window. */
export interface IpcContext {
  sender: WebContents;
}

export type IpcHandler<C extends IpcChannel> = (
  request: IpcRequest<C>,
  context: IpcContext,
) => Promise<IpcResponse<C>> | IpcResponse<C>;

/** One handler per channel; the type system enforces completeness. */
export type IpcHandlers = { [C in IpcChannel]: IpcHandler<C> };

/** Handlers for the channels of one module, e.g. all "workspace:*" channels. */
export type ModuleHandlers<Prefix extends string> = {
  [C in Extract<IpcChannel, `${Prefix}:${string}`>]: IpcHandler<C>;
};
