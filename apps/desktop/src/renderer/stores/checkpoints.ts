import { create } from 'zustand';
import type { Checkpoint, CheckpointStatus } from '@kestrel/shared';

interface CheckpointState {
  status: CheckpointStatus;
  list: readonly Checkpoint[];
}

export const useCheckpointStore = create<CheckpointState>()(() => ({
  status: { available: false, reason: 'noWorkspace' },
  list: [],
}));

/** Reloads status and list (after opening a folder or a change event). */
export async function refreshCheckpoints(): Promise<void> {
  const [status, list] = await Promise.all([
    window.kestrel.invoke('checkpoints:status'),
    window.kestrel.invoke('checkpoints:list'),
  ]);
  useCheckpointStore.setState({
    status: status.ok ? status.data : { available: false, reason: 'noWorkspace' },
    list: list.ok ? list.data : [],
  });
}
