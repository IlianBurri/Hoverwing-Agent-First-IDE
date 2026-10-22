import type { IpcError } from '@kestrel/shared';
import { i18next } from '../i18n';
import { notify } from '../stores/toasts';

/** Translated, user-friendly text for an IPC error. */
export function errorMessage(error: IpcError): string {
  return i18next.t(`errors.code.${error.code}`);
}

/** Shows an IPC error as a toast, prefixed with what the user tried to do. */
export function notifyError(action: string, error: IpcError): void {
  notify('error', `${action}: ${errorMessage(error)}`);
}
