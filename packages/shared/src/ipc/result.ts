/**
 * IPC results are always wrapped so errors reach the UI as data instead of
 * rejected promises with stack traces from the main process.
 */
export type IpcErrorCode = 'invalid_request' | 'unknown_channel' | 'internal';

export interface IpcError {
  code: IpcErrorCode;
  message: string;
}

export type IpcResult<T> = { ok: true; data: T } | { ok: false; error: IpcError };

export function ok<T>(data: T): IpcResult<T> {
  return { ok: true, data };
}

export function fail(code: IpcErrorCode, message: string): IpcResult<never> {
  return { ok: false, error: { code, message } };
}
