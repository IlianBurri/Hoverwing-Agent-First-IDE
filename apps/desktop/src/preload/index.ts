import { contextBridge, ipcRenderer } from 'electron';
import type { IpcRendererEvent } from 'electron';
import type {
  IpcChannel,
  IpcEvent,
  IpcEventPayload,
  IpcResponse,
  IpcResult,
} from '@kestrel/shared';
import { IPC_EVENT_CHANNEL, IPC_INVOKE_CHANNEL } from './api';
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

function on<E extends IpcEvent>(
  event: E,
  listener: (payload: IpcEventPayload<E>) => void,
): () => void {
  const handler = (_event: IpcRendererEvent, name: unknown, payload: unknown) => {
    // Payloads are produced by the typed `sendEvent` helper in main.
    if (name === event) listener(payload as IpcEventPayload<E>);
  };
  ipcRenderer.on(IPC_EVENT_CHANNEL, handler);
  return () => {
    ipcRenderer.removeListener(IPC_EVENT_CHANNEL, handler);
  };
}

const api: KestrelApi = { invoke, on };

contextBridge.exposeInMainWorld('kestrel', api);
