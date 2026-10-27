/**
 * IPC results are always wrapped so errors reach the UI as data instead of
 * rejected promises with stack traces from the main process.
 */
export type IpcErrorCode =
  | 'invalid_request'
  | 'unknown_channel'
  | 'internal'
  // User-facing errors: the renderer shows a translated message for each.
  | 'not_found'
  | 'already_exists'
  | 'outside_workspace'
  | 'no_workspace'
  | 'not_a_directory'
  | 'permission_denied'
  | 'invalid_pattern'
  | 'checkpoints_unavailable'
  | 'agent_not_running'
  | 'agent_not_approved'
  | 'review_conflict'
  | 'sandbox_unavailable'
  | 'sandbox_build_failed'
  | 'docker_conflict'
  | 'docker_failed'
  | 'invalid_url'
  | 'mcp_not_approved'
  | 'mcp_connect_failed'
  | 'provider_unreachable'
  | 'provider_auth'
  | 'provider_rate_limited'
  | 'provider_model_missing'
  | 'provider_failed'
  | 'model_not_set'
  | 'secret_file'
  | 'download_failed'
  | 'download_corrupt'
  | 'ollama_unavailable'
  | 'not_trusted'
  | 'git_not_repo'
  | 'git_auth'
  | 'git_rejected'
  | 'git_conflict'
  | 'git_nothing_to_commit'
  | 'git_no_remote'
  | 'git_failed'
  | 'layout_invalid';

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
