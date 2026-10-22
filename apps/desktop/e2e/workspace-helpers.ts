import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import type { ElectronApplication } from '@playwright/test';

/** Creates a project folder with the given files (path -> content). */
export function createProject(files: Record<string, string>): string {
  const root = mkdtempSync(join(tmpdir(), 'kestrel-project-'));
  for (const [path, content] of Object.entries(files)) {
    mkdirSync(dirname(join(root, path)), { recursive: true });
    writeFileSync(join(root, path), content);
  }
  return root;
}

/** Makes the native "open folder" dialog return `folder` without UI. */
export async function stubOpenDialog(app: ElectronApplication, folder: string): Promise<void> {
  await app.evaluate(({ dialog }, path) => {
    Object.assign(dialog, {
      showOpenDialog: () => Promise.resolve({ canceled: false, filePaths: [path] }),
    });
  }, folder);
}

/**
 * Containers have no desktop trash, so the trash is replaced by a move into
 * `<root>/../.test-trash`. Returns that folder.
 */
export async function stubTrash(app: ElectronApplication, root: string): Promise<string> {
  const trash = join(dirname(root), `${root.split('/').pop() ?? 'x'}-trash`);
  mkdirSync(trash, { recursive: true });
  await app.evaluate(({ shell }, target) => {
    // Dynamic import is not available inside evaluate(); builtins are.
    const fs = process.getBuiltinModule('node:fs/promises');
    const path = process.getBuiltinModule('node:path');
    Object.assign(shell, {
      trashItem: (item: string) => fs.rename(item, path.join(target, path.basename(item))),
    });
  }, trash);
  return trash;
}
