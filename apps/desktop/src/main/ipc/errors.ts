import type { IpcErrorCode } from '@kestrel/shared';

/**
 * An error the user should see. Its code reaches the renderer, which shows
 * a translated message; the message here is only for logs.
 */
export class UserError extends Error {
  constructor(
    readonly code: Exclude<IpcErrorCode, 'internal' | 'invalid_request' | 'unknown_channel'>,
    message: string,
  ) {
    super(message);
    this.name = 'UserError';
  }
}

/** Maps common Node.js file system errors to user-facing ones. */
export function toUserError(error: unknown): UserError | null {
  if (error instanceof UserError) return error;
  const code = error instanceof Error && 'code' in error ? error.code : undefined;
  switch (code) {
    case 'ENOENT':
      return new UserError('not_found', 'File or folder not found.');
    case 'EEXIST':
    case 'ENOTEMPTY':
      return new UserError('already_exists', 'A file or folder with this name already exists.');
    case 'ENOTDIR':
      return new UserError('not_a_directory', 'Not a folder.');
    case 'EACCES':
    case 'EPERM':
      return new UserError('permission_denied', 'Permission denied.');
    default:
      return null;
  }
}
