import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { auditEntrySchema } from '@kestrel/shared';
import type { AuditEntry } from '@kestrel/shared';
import { appendLine, projectKey } from '../../lib/jsonFile';
import { redact } from '../../lib/redact';

/** Append-only log (JSON lines) of every permission decision, per project. */
export class AuditLog {
  constructor(private readonly dir: string) {}

  private file(root: string | null): string {
    return join(this.dir, root === null ? 'audit-global.jsonl' : `audit-${projectKey(root)}.jsonl`);
  }

  async append(root: string | null, entry: AuditEntry): Promise<AuditEntry> {
    const safe = { ...entry, target: redact(entry.target) };
    await appendLine(this.file(root), JSON.stringify(safe));
    return safe;
  }

  /** The newest `limit` entries, newest first. */
  async read(root: string | null, limit: number): Promise<AuditEntry[]> {
    let text: string;
    try {
      text = await readFile(this.file(root), 'utf8');
    } catch {
      return [];
    }
    const entries: AuditEntry[] = [];
    const lines = text.split('\n');
    for (let index = lines.length - 1; index >= 0 && entries.length < limit; index--) {
      const line = lines[index];
      if (!line) continue;
      try {
        const parsed = auditEntrySchema.safeParse(JSON.parse(line));
        if (parsed.success) entries.push(parsed.data);
      } catch {
        // Skip a damaged line instead of losing the whole log.
      }
    }
    return entries;
  }
}
