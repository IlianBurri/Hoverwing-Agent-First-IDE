import { mkdir, readFile, unlink, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import type { HunkSelection, ReviewDiff, ReviewFile } from '@kestrel/shared';
import { UserError } from '../../ipc/errors';
import { resolveInWorkspace } from '../workspace/paths';
import { applySelection, computeHunks, countLines } from './hunks';

interface Change {
  path: string;
  /** Content before the agent touched the file (null = did not exist). */
  original: string | null;
  /** Content the agent wants (null = file deleted). */
  proposed: string | null;
  source: 'held' | 'applied';
  /** Agent (tab) that holds the change; a held write locks the file for it. */
  agentKey: string | null;
  /** Names of the agents that changed the file. */
  agents: string[];
}

/** Which agent a change comes from. */
export interface ChangeAuthor {
  /** Unique per running agent tab (window + tab), not the agent's session id. */
  key: string;
  agentName: string;
}

function withAgent(agents: readonly string[], author: ChangeAuthor | undefined): string[] {
  return author && !agents.includes(author.agentName) ? [...agents, author.agentName] : [...agents];
}

/** Where "applied" changes come from: the checkpoint taken before a turn. */
export interface CheckpointReader {
  changesSince(root: string, checkpointId: string): Promise<{ path: string; status: string }[]>;
  fileAt(root: string, checkpointId: string, path: string): Promise<string | null>;
}

const MAX_REVIEW_SIZE = 5 * 1024 * 1024;

function reviewable(text: string | null): boolean {
  return text === null || (text.length <= MAX_REVIEW_SIZE && !text.includes('\0'));
}

/**
 * Agent changes that wait for the user's decision, per project.
 * - "held": Hoverwing kept the write back; the file on disk is unchanged.
 * - "applied": the agent wrote the file itself; rejecting restores it.
 */
export class ReviewService {
  private readonly projects = new Map<string, Map<string, Change>>();

  constructor(
    private readonly checkpoints: CheckpointReader,
    private readonly onChanged: (root: string) => void,
  ) {}

  private changes(root: string): Map<string, Change> {
    let changes = this.projects.get(root);
    if (!changes) {
      changes = new Map();
      this.projects.set(root, changes);
    }
    return changes;
  }

  private async readDisk(root: string, path: string): Promise<string | null> {
    return readFile(await resolveInWorkspace(root, path), 'utf8').catch(() => null);
  }

  /**
   * The agent (other than `agentKey`) whose held change locks the file, or
   * null. Parallel agents must not overwrite each other's pending work.
   */
  lockedBy(root: string, path: string, agentKey: string): string | null {
    const change = this.projects.get(root)?.get(path);
    if (change?.source !== 'held' || change.agentKey === null || change.agentKey === agentKey)
      return null;
    return change.agents.at(-1) ?? 'Agent';
  }

  /** Path A: keeps an agent write back instead of writing it to disk. */
  async hold(root: string, path: string, content: string, author?: ChangeAuthor): Promise<void> {
    const changes = this.changes(root);
    const existing = changes.get(path);
    if (author && this.lockedBy(root, path, author.key) !== null) {
      throw new UserError('agent_conflict', 'Another agent is changing this file.');
    }
    const original = existing ? existing.original : await this.readDisk(root, path);
    if (original === content) changes.delete(path);
    else
      changes.set(path, {
        path,
        original,
        proposed: content,
        source: existing?.source ?? 'held',
        agentKey: author?.key ?? null,
        agents: withAgent(existing?.agents ?? [], author),
      });
    this.onChanged(root);
  }

  /** What the agent should see when it reads a file it wrote (if held). */
  heldContent(root: string, path: string, agentKey?: string): string | undefined {
    const change = this.projects.get(root)?.get(path);
    // Another agent's pending change is not visible: it reads the disk.
    if (agentKey !== undefined && change?.agentKey != null && change.agentKey !== agentKey)
      return undefined;
    return change?.source === 'held' && change.proposed !== null ? change.proposed : undefined;
  }

  /** Path B: after a turn, picks up files the agent changed on disk itself. */
  async collectApplied(root: string, checkpointId: string, author?: ChangeAuthor): Promise<void> {
    const changes = this.changes(root);
    let found = false;
    for (const { path } of await this.checkpoints.changesSince(root, checkpointId)) {
      const existing = changes.get(path);
      if (existing?.source === 'held') continue;
      const original = existing
        ? existing.original
        : await this.checkpoints.fileAt(root, checkpointId, path);
      const proposed = await this.readDisk(root, path);
      if (!reviewable(original) || !reviewable(proposed)) continue;
      if (original === proposed) changes.delete(path);
      else
        changes.set(path, {
          path,
          original,
          proposed,
          source: 'applied',
          agentKey: existing?.agentKey ?? null,
          agents: withAgent(existing?.agents ?? [], author),
        });
      found = true;
    }
    if (found) this.onChanged(root);
  }

  list(root: string): ReviewFile[] {
    return [...(this.projects.get(root)?.values() ?? [])]
      .sort((a, b) => a.path.localeCompare(b.path))
      .map((change) => {
        const hunks = computeHunks(change.original, change.proposed);
        return {
          path: change.path,
          status:
            change.original === null ? 'added' : change.proposed === null ? 'deleted' : 'modified',
          source: change.source,
          ...countLines(hunks),
          hunks: hunks.length,
          agents: change.agents,
        };
      });
  }

  diff(root: string, path: string): ReviewDiff {
    const change = this.projects.get(root)?.get(path);
    if (!change) throw new UserError('not_found', 'No pending change for this file.');
    return {
      path,
      source: change.source,
      original: change.original,
      proposed: change.proposed,
      hunks: computeHunks(change.original, change.proposed),
    };
  }

  /** Keeps the selected hunks and drops the rest; the file leaves the list. */
  async resolve(root: string, path: string, keep: HunkSelection): Promise<void> {
    const changes = this.changes(root);
    const change = changes.get(path);
    if (!change) throw new UserError('not_found', 'No pending change for this file.');
    const disk = await this.readDisk(root, path);
    const expected = change.source === 'held' ? change.original : change.proposed;
    if (disk !== expected) {
      // Someone changed the file in the meantime: never overwrite blindly.
      if (change.source === 'applied') change.proposed = disk;
      this.onChanged(root);
      throw new UserError('review_conflict', 'The file changed in the meantime.');
    }
    const result = applySelection(change.original, change.proposed, keep);
    if (result !== disk) {
      const absolute = await resolveInWorkspace(root, path);
      if (result === null) {
        await unlink(absolute).catch(() => undefined);
      } else {
        await mkdir(dirname(absolute), { recursive: true });
        await writeFile(absolute, result, 'utf8');
      }
    }
    changes.delete(path);
    this.onChanged(root);
  }

  async resolveAll(root: string, keep: 'all' | 'none'): Promise<number> {
    let resolved = 0;
    for (const path of [...this.changes(root).keys()]) {
      try {
        await this.resolve(root, path, keep);
        resolved++;
      } catch {
        // Conflicting files stay in the list for a manual decision.
      }
    }
    return resolved;
  }
}
