import { mkdir, rm, unlink, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { SENSITIVE_FILE_PATTERNS } from '@kestrel/shared';
import type { Checkpoint, CheckpointChange, CheckpointKind } from '@kestrel/shared';
import { HEAVY_DIRECTORIES } from '../workspace/heavy';
import { resolveInWorkspace } from '../workspace/paths';
import { runGit } from './git';

const BRANCH = 'refs/heads/checkpoints';
const META_PREFIX = 'kestrel-meta:';

interface Meta {
  kind: CheckpointKind;
  sessionId: string | null;
}

/**
 * Checkpoints for one project, stored in a separate git directory in the app
 * data folder. The project's own .git (if any) is never read or written.
 */
export class ShadowRepo {
  private queue: Promise<unknown> = Promise.resolve();
  private initialized = false;

  constructor(
    private readonly gitDir: string,
    private readonly root: string,
  ) {}

  /** Runs operations one after another; git does not like parallel writers. */
  private serial<T>(operation: () => Promise<T>): Promise<T> {
    const next = this.queue.then(operation, operation);
    this.queue = next.catch(() => undefined);
    return next;
  }

  private git(args: readonly string[], extra: { indexFile?: string } = {}) {
    return runGit(args, { gitDir: this.gitDir, workTree: this.root, ...extra });
  }

  private async init(): Promise<void> {
    if (this.initialized) return;
    await mkdir(dirname(this.gitDir), { recursive: true });
    await runGit(['init', '--quiet', '--bare', this.gitDir], {
      gitDir: this.gitDir,
      workTree: this.root,
      plain: true,
    });
    // Heavy folders and secrets never go into checkpoints (in addition to .gitignore).
    const excludes = [
      ...[...HEAVY_DIRECTORIES].map((name) => `${name}/`),
      ...SENSITIVE_FILE_PATTERNS,
      '!.env.example',
      '!.env.sample',
      '!.env.template',
    ];
    await mkdir(join(this.gitDir, 'info'), { recursive: true });
    await writeFile(join(this.gitDir, 'info', 'exclude'), `${excludes.join('\n')}\n`);
    this.initialized = true;
  }

  /** Snapshot of the current project as a tree id, using a throwaway index. */
  private async currentTree(): Promise<string> {
    const indexFile = join(this.gitDir, `index-${String(process.pid)}-${String(Date.now())}`);
    try {
      await this.git(['add', '--all'], { indexFile });
      return (await this.git(['write-tree'], { indexFile })).stdout.trim();
    } finally {
      await rm(indexFile, { force: true });
    }
  }

  private async head(): Promise<string | null> {
    try {
      return (await this.git(['rev-parse', '--verify', '--quiet', BRANCH])).stdout.trim() || null;
    } catch {
      return null;
    }
  }

  create(
    label: string,
    kind: CheckpointKind,
    sessionId: string | null = null,
  ): Promise<Checkpoint> {
    return this.serial(async () => {
      await this.init();
      const tree = await this.currentTree();
      const parent = await this.head();
      const meta: Meta = { kind, sessionId };
      const message = `${label.replace(/\s+/g, ' ').slice(0, 200)}\n\n${META_PREFIX}${JSON.stringify(meta)}\n`;
      const args = ['commit-tree', tree, ...(parent ? ['-p', parent] : []), '-F', '-'];
      const id = (
        await runGit(args, { gitDir: this.gitDir, workTree: this.root, input: message })
      ).stdout.trim();
      await this.git(['update-ref', BRANCH, id]);
      return { id, time: Date.now(), kind, label: label.slice(0, 200), sessionId };
    });
  }

  list(limit = 200): Promise<Checkpoint[]> {
    return this.serial(async () => {
      await this.init();
      if (!(await this.head())) return [];
      const format = '%H%x1f%ct%x1f%B%x1e';
      const { stdout } = await this.git([
        'log',
        `-n${String(limit)}`,
        `--format=${format}`,
        BRANCH,
      ]);
      return stdout
        .split('\x1e')
        .map((record) => record.trim())
        .filter(Boolean)
        .map((record) => parseRecord(record))
        .filter((entry): entry is Checkpoint => entry !== null);
    });
  }

  /** Files that differ between the checkpoint and the project now. */
  changesSince(id: string): Promise<CheckpointChange[]> {
    return this.serial(async () => {
      await this.init();
      const tree = await this.currentTree();
      const { stdout } = await this.git([
        'diff-tree',
        '-r',
        '-z',
        '--name-status',
        '--no-renames',
        id,
        tree,
      ]);
      return parseNameStatus(stdout);
    });
  }

  /** File content at a checkpoint, or null if the file did not exist. */
  fileAt(id: string, path: string): Promise<string | null> {
    return this.serial(async () => {
      try {
        return (await this.git(['show', `${id}:${path}`])).stdout;
      } catch {
        return null;
      }
    });
  }

  /** Restores files to the state of the checkpoint (all changes, or `paths`). */
  async restore(id: string, paths?: readonly string[]): Promise<number> {
    const changes = await this.changesSince(id);
    const selected = paths ? changes.filter((change) => paths.includes(change.path)) : changes;
    return this.serial(async () => {
      for (const change of selected) {
        const absolute = await resolveInWorkspace(this.root, change.path);
        if (change.status === 'added') {
          await unlink(absolute).catch(() => undefined);
          continue;
        }
        // `checkout` writes the exact bytes (also binary files).
        await mkdir(dirname(absolute), { recursive: true });
        const indexFile = join(this.gitDir, `restore-index-${String(Date.now())}`);
        try {
          await this.git(['checkout', id, '--', change.path], { indexFile });
        } finally {
          await rm(indexFile, { force: true });
        }
      }
      return selected.length;
    });
  }
}

function parseRecord(record: string): Checkpoint | null {
  const [id, seconds, body] = record.split('\x1f');
  if (!id || !seconds || body === undefined) return null;
  const lines = body.split('\n');
  const metaLine = lines.find((line) => line.startsWith(META_PREFIX));
  let meta: Meta = { kind: 'manual', sessionId: null };
  if (metaLine) {
    try {
      meta = { ...meta, ...(JSON.parse(metaLine.slice(META_PREFIX.length)) as Partial<Meta>) };
    } catch {
      // Keep defaults for damaged metadata.
    }
  }
  return {
    id,
    time: Number(seconds) * 1000,
    kind: meta.kind,
    label: lines[0] ?? '',
    sessionId: meta.sessionId,
  };
}

/** Parses `git diff-tree -z --name-status` output. */
export function parseNameStatus(output: string): CheckpointChange[] {
  const parts = output.split('\0').filter((part) => part !== '');
  const changes: CheckpointChange[] = [];
  for (let index = 0; index + 1 < parts.length; index += 2) {
    const code = parts[index];
    const path = parts[index + 1] ?? '';
    const status = code === 'A' ? 'added' : code === 'D' ? 'deleted' : 'modified';
    changes.push({ path, status });
  }
  return changes;
}
