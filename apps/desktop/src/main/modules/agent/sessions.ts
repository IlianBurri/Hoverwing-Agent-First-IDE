import { join } from 'node:path';
import { z } from 'zod';
import { sessionSummarySchema } from '@kestrel/shared';
import type { SessionSummary } from '@kestrel/shared';
import { projectKey, readJsonFile, writeJsonFile } from '../../lib/jsonFile';

const MAX_SESSIONS = 50;

/** Recent agent sessions per project, so they can be resumed later. */
export class SessionHistory {
  constructor(private readonly dir: string) {}

  private file(root: string): string {
    return join(this.dir, `sessions-${projectKey(root)}.json`);
  }

  list(root: string): Promise<SessionSummary[]> {
    return readJsonFile(this.file(root), z.array(sessionSummarySchema), []);
  }

  async remember(root: string, session: SessionSummary): Promise<void> {
    const existing = await this.list(root);
    const previous = existing.find((entry) => entry.id === session.id);
    const merged = { ...session, title: previous?.title || session.title };
    const next = [merged, ...existing.filter((entry) => entry.id !== session.id)].slice(
      0,
      MAX_SESSIONS,
    );
    await writeJsonFile(this.file(root), next);
  }
}
