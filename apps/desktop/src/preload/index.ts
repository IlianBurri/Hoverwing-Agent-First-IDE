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

/**
 * One IPC listener for all events, dispatching by event name. (One listener
 * per subscription would pile up on the same channel.)
 */
const listeners = new Map<string, Set<(payload: unknown) => void>>();

ipcRenderer.on(IPC_EVENT_CHANNEL, (_event: IpcRendererEvent, name: unknown, payload: unknown) => {
  if (typeof name !== 'string') return;
  for (const listener of listeners.get(name) ?? []) listener(payload);
});

function on<E extends IpcEvent>(
  event: E,
  listener: (payload: IpcEventPayload<E>) => void,
): () => void {
  // Payloads are produced by the typed `sendEvent` helper in main.
  const wrapped = (payload: unknown) => {
    listener(payload as IpcEventPayload<E>);
  };
  const set = listeners.get(event) ?? new Set();
  set.add(wrapped);
  listeners.set(event, set);
  return () => {
    set.delete(wrapped);
  };
}

const api: KestrelApi = { invoke, on };

contextBridge.exposeInMainWorld('kestrel', api);
