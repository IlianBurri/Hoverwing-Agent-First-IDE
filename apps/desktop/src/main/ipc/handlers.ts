import type { IpcChannel, IpcRequest, IpcResponse } from '@kestrel/shared';

/** One handler per channel; the type system enforces completeness. */
export type IpcHandlers = {
  [C in IpcChannel]: (request: IpcRequest<C>) => Promise<IpcResponse<C>> | IpcResponse<C>;
};
