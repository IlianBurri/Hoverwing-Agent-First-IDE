import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { BrowserWindow, dialog } from 'electron';
import type { OpenDialogOptions } from 'electron';
import type { ModuleHandlers } from '../../ipc/handlers';
import { UserError } from '../../ipc/errors';
import type { OpenWorkspaceFolder } from '../workspace';
import type { GitHubService } from './service';

export interface GitHubHandlerDeps {
  /** Clones `url` into `parent/name` (with the signed-in account's credentials). */
  clone: (parent: string, url: string, name: string) => Promise<void>;
  openFolder: OpenWorkspaceFolder;
}

export function createGitHubHandlers(
  github: GitHubService,
  deps: GitHubHandlerDeps,
): ModuleHandlers<'github'> {
  return {
    'github:status': () => github.status(),
    'github:signIn': () => github.startSignIn(),
    'github:cancelSignIn': () => {
      github.cancelSignIn();
      return null;
    },
    'github:signOut': async () => {
      await github.signOut();
      return null;
    },
    'github:repos': () => github.repos(),
    'github:clone': async ({ fullName }, { sender }) => {
      if ((await github.token()) === null) {
        throw new UserError('github_auth', 'Not signed in to GitHub.');
      }
      // The target is chosen natively; the renderer only names the repository.
      const window = BrowserWindow.fromWebContents(sender);
      const options: OpenDialogOptions = { properties: ['openDirectory', 'createDirectory'] };
      const result = window
        ? await dialog.showOpenDialog(window, options)
        : await dialog.showOpenDialog(options);
      const parent = result.filePaths[0];
      if (result.canceled || !parent) return null;
      const name = fullName.slice(fullName.indexOf('/') + 1);
      if (existsSync(join(parent, name))) {
        throw new UserError('already_exists', 'The folder already exists.');
      }
      await deps.clone(parent, github.cloneUrl(fullName), name);
      return deps.openFolder(sender, join(parent, name));
    },
  };
}
