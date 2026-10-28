import { mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ReviewService } from './service';
import type { CheckpointReader } from './service';

let root: string;
const onChanged = vi.fn();
const noCheckpoints: CheckpointReader = {
  changesSince: () => Promise.resolve([]),
  fileAt: () => Promise.resolve(null),
};

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'kestrel-review-'));
  await writeFile(join(root, 'a.ts'), 'one\ntwo\n');
});

afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});

const read = (path: string) => readFile(join(root, path), 'utf8');
const exists = (path: string) =>
  stat(join(root, path)).then(
    () => true,
    () => false,
  );

describe('ReviewService – held changes', () => {
  it('keeps the disk unchanged until accepted, and serves the held version to the agent', async () => {
    const review = new ReviewService(noCheckpoints, onChanged);
    await review.hold(root, 'a.ts', 'one\nTWO\n');
    expect(await read('a.ts')).toBe('one\ntwo\n');
    expect(review.heldContent(root, 'a.ts')).toBe('one\nTWO\n');
    expect(review.list(root)).toMatchObject([
      { path: 'a.ts', status: 'modified', source: 'held', additions: 1, deletions: 1, hunks: 1 },
    ]);

    await review.resolve(root, 'a.ts', 'all');
    expect(await read('a.ts')).toBe('one\nTWO\n');
    expect(review.list(root)).toEqual([]);
  });

  it('rejecting leaves the file exactly as it was', async () => {
    const review = new ReviewService(noCheckpoints, onChanged);
    await review.hold(root, 'a.ts', 'changed\n');
    await review.hold(root, 'new.ts', 'created\n');
    await review.resolveAll(root, 'none');
    expect(await read('a.ts')).toBe('one\ntwo\n');
    expect(await exists('new.ts')).toBe(false);
  });

  it('refuses to overwrite a file the user changed meanwhile', async () => {
    const review = new ReviewService(noCheckpoints, onChanged);
    await review.hold(root, 'a.ts', 'agent\n');
    await writeFile(join(root, 'a.ts'), 'user edit\n');
    await expect(review.resolve(root, 'a.ts', 'all')).rejects.toMatchObject({
      code: 'review_conflict',
    });
    expect(await read('a.ts')).toBe('user edit\n');
  });
});

describe('ReviewService – applied changes', () => {
  it('picks up direct writes after a turn and restores them on reject', async () => {
    const checkpoints: CheckpointReader = {
      changesSince: () => Promise.resolve([{ path: 'a.ts', status: 'modified' }]),
      fileAt: () => Promise.resolve('one\ntwo\n'),
    };
    const review = new ReviewService(checkpoints, onChanged);
    await writeFile(join(root, 'a.ts'), 'one\nagent\n');
    await review.collectApplied(root, 'c'.repeat(40));
    expect(review.list(root)).toMatchObject([{ path: 'a.ts', source: 'applied' }]);

    await review.resolve(root, 'a.ts', 'none');
    expect(await read('a.ts')).toBe('one\ntwo\n');
  });

  it('can keep only some hunks of a direct write', async () => {
    const original =
      Array.from({ length: 20 }, (_, index) => `l${String(index)}`).join('\n') + '\n';
    const changed = original.replace('l1\n', 'first\n').replace('l18\n', 'second\n');
    const checkpoints: CheckpointReader = {
      changesSince: () => Promise.resolve([{ path: 'a.ts', status: 'modified' }]),
      fileAt: () => Promise.resolve(original),
    };
    const review = new ReviewService(checkpoints, onChanged);
    await writeFile(join(root, 'a.ts'), changed);
    await review.collectApplied(root, 'c'.repeat(40));
    await review.resolve(root, 'a.ts', [1]);
    const result = await read('a.ts');
    expect(result).toContain('second');
    expect(result).not.toContain('first');
  });
});

describe('ReviewService – parallel agents', () => {
  const alpha = { key: '1:a', agentName: 'Alpha' };
  const beta = { key: '1:b', agentName: 'Beta' };

  it("locks a file held by one agent against another agent's writes", async () => {
    const review = new ReviewService(noCheckpoints, onChanged);
    await review.hold(root, 'a.ts', 'alpha\n', alpha);
    expect(review.lockedBy(root, 'a.ts', beta.key)).toBe('Alpha');
    expect(review.lockedBy(root, 'a.ts', alpha.key)).toBeNull();
    await expect(review.hold(root, 'a.ts', 'beta\n', beta)).rejects.toMatchObject({
      code: 'agent_conflict',
    });
    // The held version is Alpha's only; Beta reads the disk.
    expect(review.heldContent(root, 'a.ts', alpha.key)).toBe('alpha\n');
    expect(review.heldContent(root, 'a.ts', beta.key)).toBeUndefined();
    expect(review.list(root)).toMatchObject([{ path: 'a.ts', agents: ['Alpha'] }]);

    // Once resolved, the file is free again.
    await review.resolve(root, 'a.ts', 'none');
    await review.hold(root, 'a.ts', 'beta\n', beta);
    expect(review.list(root)).toMatchObject([{ path: 'a.ts', agents: ['Beta'] }]);
  });

  it('names every agent that changed a file it wrote directly', async () => {
    const checkpoints: CheckpointReader = {
      changesSince: () => Promise.resolve([{ path: 'a.ts', status: 'modified' }]),
      fileAt: () => Promise.resolve('one\ntwo\n'),
    };
    const review = new ReviewService(checkpoints, onChanged);
    await writeFile(join(root, 'a.ts'), 'alpha\n');
    await review.collectApplied(root, 'c'.repeat(40), alpha);
    await writeFile(join(root, 'a.ts'), 'beta\n');
    await review.collectApplied(root, 'd'.repeat(40), beta);
    expect(review.list(root)).toMatchObject([
      { path: 'a.ts', source: 'applied', agents: ['Alpha', 'Beta'] },
    ]);
    expect(review.lockedBy(root, 'a.ts', beta.key)).toBeNull();
  });
});
