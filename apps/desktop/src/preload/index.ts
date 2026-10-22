import { contextBridge, ipcRenderer } from 'electron';
import type { IpcChannel, IpcResponse, IpcResult } from '@kestrel/shared';
import { IPC_INVOKE_CHANNEL } from './api';
import type { IpcArgs, KestrelApi } from './api';

function invoke<C extends IpcChannel>(
  channel: C,
  ...request: IpcArgs<C>
): Promise<IpcResult<IpcResponse<C>>> {
  // The main process validates the request and the response shape.
  return ipcRenderer.invoke(IPC_INVOKE_CHANNEL, channel, request[0]) as Promise<
    IpcResult<IpcResponse<C>>
  >;
}

const api: KestrelApi = { invoke };

contextBridge.exposeInMainWorld('kestrel', api);
