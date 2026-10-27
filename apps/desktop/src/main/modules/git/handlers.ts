import type { ModuleHandlers } from '../../ipc/handlers';
import type { WorkspaceManager } from '../workspace';
import type { GitService } from './service';

export function createGitHandlers(
  git: GitService,
  workspaces: WorkspaceManager,
): ModuleHandlers<'git'> {
  const root = (ownerId: number) => workspaces.requireRoot(ownerId);
  const done = async (task: Promise<void>, ownerId: number) => {
    await task;
    git.touch(ownerId);
    return null;
  };
  return {
    'git:status': (_request, { sender }) => git.status(sender.id, root(sender.id)),
    'git:diff': ({ path, staged }, { sender }) => git.diff(root(sender.id), path, staged),
    'git:stage': ({ paths }, { sender }) => done(git.stage(root(sender.id), paths), sender.id),
    'git:unstage': ({ paths }, { sender }) => done(git.unstage(root(sender.id), paths), sender.id),
    'git:discard': ({ paths }, { sender }) =>
      done(git.discard(sender.id, root(sender.id), paths), sender.id),
    'git:commit': ({ message }, { sender }) =>
      done(git.commit(root(sender.id), message), sender.id),
    'git:branches': (_request, { sender }) => git.branches(root(sender.id)),
    'git:checkout': ({ branch }, { sender }) =>
      done(git.checkout(root(sender.id), branch), sender.id),
    'git:createBranch': ({ name }, { sender }) =>
      done(git.createBranch(root(sender.id), name), sender.id),
    'git:init': (_request, { sender }) => done(git.init(root(sender.id)), sender.id),
    'git:fetch': (_request, { sender }) => done(git.fetch(root(sender.id)), sender.id),
    'git:pull': (_request, { sender }) => done(git.pull(root(sender.id)), sender.id),
    'git:push': (_request, { sender }) => done(git.push(sender.id, root(sender.id)), sender.id),
  };
}
