import type { ModuleHandlers } from '../../ipc/handlers';
import type { WorkspaceManager } from '../workspace';
import { replaceInFiles, searchRegExp } from './replace';
import type { SearchRunner } from './search';

export function createSearchHandlers(
  runner: SearchRunner,
  workspaces: WorkspaceManager,
): ModuleHandlers<'search'> {
  return {
    'search:find': (options, { sender }) => {
      const root = workspaces.requireRoot(sender.id);
      // Validate the pattern with the same rules the replace uses.
      if (options.isRegex) searchRegExp(options);
      return runner.find(sender.id, root, options);
    },
    'search:cancel': (_request, { sender }) => {
      runner.cancel(sender.id);
      return null;
    },
    'search:replace': ({ options, replacement, paths }, { sender }) =>
      replaceInFiles(workspaces.requireRoot(sender.id), options, replacement, paths),
  };
}
