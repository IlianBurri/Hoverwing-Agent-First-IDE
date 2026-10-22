import { fail, ipcContract, isIpcChannel, ok } from '@kestrel/shared';
import type { IpcChannel, IpcResult } from '@kestrel/shared';
import { toUserError } from './errors';
import type { IpcContext, IpcHandlers } from './handlers';

/**
 * Validates an incoming request and runs the matching handler.
 * Never throws: every failure becomes an `IpcResult` error the UI can show.
 */
export async function dispatch(
  handlers: IpcHandlers,
  channel: unknown,
  payload: unknown,
  context: IpcContext,
): Promise<IpcResult<unknown>> {
  if (!isIpcChannel(channel)) {
    return fail('unknown_channel', 'Unknown IPC channel.');
  }
  return runChannel(handlers, channel, payload, context);
}

async function runChannel(
  handlers: IpcHandlers,
  channel: IpcChannel,
  payload: unknown,
  context: IpcContext,
): Promise<IpcResult<unknown>> {
  const contract = ipcContract[channel];
  const parsed = contract.request.safeParse(payload);
  if (!parsed.success) {
    return fail('invalid_request', `Invalid request for ${channel}.`);
  }
  try {
    // TypeScript cannot correlate `handlers[channel]` with `parsed.data` across
    // the channel union; the request was validated against this channel's schema above.
    const handler = handlers[channel] as (request: unknown, context: IpcContext) => unknown;
    const response = await handler(parsed.data, context);
    return ok(contract.response.parse(response));
  } catch (error) {
    // Known, user-facing errors carry a code the UI translates. Their message
    // is generic on purpose: no paths or system details reach the renderer.
    const userError = toUserError(error);
    if (userError) return fail(userError.code, userError.message);
    // Log the details locally, send only a generic message to the renderer.
    console.error(`[ipc] ${channel} failed`, error);
    return fail('internal', `${channel} failed.`);
  }
}
