import { UserError } from '../../ipc/errors';

/** Turns git's error output into a user-facing error (details go to the log). */
export function classifyGitError(stderr: string): UserError {
  const text = stderr.toLowerCase();
  if (text.includes('not a git repository')) {
    return new UserError('git_not_repo', 'Not a Git repository.');
  }
  if (
    text.includes('authentication failed') ||
    text.includes('could not read username') ||
    text.includes('could not read password') ||
    text.includes('terminal prompts disabled') ||
    text.includes('permission denied (publickey') ||
    text.includes('host key verification failed')
  ) {
    return new UserError('git_auth', 'Git could not authenticate.');
  }
  if (
    text.includes('[rejected]') ||
    text.includes('non-fast-forward') ||
    text.includes('fetch first') ||
    text.includes('not possible to fast-forward')
  ) {
    return new UserError('git_rejected', 'The remote has changes you do not have yet.');
  }
  if (
    text.includes('conflict') ||
    text.includes('would be overwritten') ||
    text.includes('unmerged files') ||
    text.includes('you have unstaged changes')
  ) {
    return new UserError('git_conflict', 'Local changes or conflicts prevent this.');
  }
  if (text.includes('nothing to commit') || text.includes('no changes added to commit')) {
    return new UserError('git_nothing_to_commit', 'Nothing is staged.');
  }
  if (text.includes('already exists')) {
    return new UserError('already_exists', 'A branch with this name already exists.');
  }
  return new UserError('git_failed', 'Git failed.');
}
