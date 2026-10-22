import type { WebContents } from 'electron';
import type { IpcChannel, IpcRequest, IpcResponse } from '@kestrel/shared';

/** Who sent the request. Handlers use it e.g. to find the calling window. */
export interface IpcContext {
  sender: WebContents;
}

/** One handler per channel; the type system enforces completeness. */
export type IpcHandlers = {
  [C in IpcChannel]: (
    request: IpcRequest<C>,
    context: IpcContext,
  ) => Promise<IpcResponse<C>> | IpcResponse<C>;
};
