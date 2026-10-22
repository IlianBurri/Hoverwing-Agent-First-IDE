import { subscribe } from '@parcel/watcher';
import type { WorkspaceChanges } from '@kestrel/shared';
import { ChangeBatcher } from './batcher';
import { HEAVY_DIRECTORIES } from './heavy';
import { toRelative } from './paths';

export interface WorkspaceWatcher {
  close(): Promise<void>;
}

/**
 * Watches the whole workspace recursively with the OS's native file events.
 * Heavy folders (node_modules, .git, …) are ignored to stay fast.
 */
export async function watchWorkspace(
  root: string,
  onChanges: (changes: WorkspaceChanges) => void,
): Promise<WorkspaceWatcher> {
  const batcher = new ChangeBatcher(onChanges);
  const subscription = await subscribe(
    root,
    (error, events) => {
      if (error) {
        console.warn('[workspace] watcher error', error.message);
        return;
      }
      batcher.push(
        events.map((event) => ({ type: event.type, path: toRelative(root, event.path) })),
      );
    },
    { ignore: [...HEAVY_DIRECTORIES].map((name) => `**/${name}`) },
  );

  return {
    async close() {
      batcher.dispose();
      await subscription.unsubscribe();
    },
  };
}
