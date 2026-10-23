import { join } from 'node:path';
import type { Checkpoint, CheckpointKind, CheckpointStatus } from '@kestrel/shared';
import { projectKey } from '../../lib/jsonFile';
import { gitAvailable } from './git';
import { ShadowRepo } from './shadowRepo';

/** One shadow repository per project folder, created on first use. */
export class CheckpointService {
  private readonly repos = new Map<string, ShadowRepo>();
  private available: Promise<boolean> | null = null;

  constructor(
    private readonly dataDir: string,
    private readonly onChanged: (root: string) => void,
  ) {}

  async status(root: string | null): Promise<CheckpointStatus> {
    if (root === null) return { available: false, reason: 'noWorkspace' };
    this.available ??= gitAvailable();
    return (await this.available)
      ? { available: true, reason: null }
      : { available: false, reason: 'noGit' };
  }

  repo(root: string): ShadowRepo {
    let repo = this.repos.get(root);
    if (!repo) {
      repo = new ShadowRepo(join(this.dataDir, `${projectKey(root)}.git`), root);
      this.repos.set(root, repo);
    }
    return repo;
  }

  async create(
    root: string,
    label: string,
    kind: CheckpointKind,
    sessionId: string | null = null,
  ): Promise<Checkpoint | null> {
    if (!(await this.status(root)).available) return null;
    const checkpoint = await this.repo(root).create(label, kind, sessionId);
    this.onChanged(root);
    return checkpoint;
  }

  /** Saves the current state, then restores the checkpoint (undoable). */
  async restore(
    root: string,
    id: string,
    label: string,
    paths?: readonly string[],
  ): Promise<{ restored: number; safety: Checkpoint }> {
    const safety = await this.repo(root).create(label, 'beforeRestore');
    const restored = await this.repo(root).restore(id, paths);
    this.onChanged(root);
    return { restored, safety };
  }
}
