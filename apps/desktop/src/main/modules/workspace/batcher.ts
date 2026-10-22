import type { FileChange, WorkspaceChanges } from '@kestrel/shared';

/**
 * Collects file changes for a short moment and delivers them in one batch,
 * so e.g. `npm install` does not flood the UI with thousands of messages.
 * Too many changes collapse into a single "overflow" signal.
 */
export class ChangeBatcher {
  private pending = new Map<string, FileChange>();
  private overflow = false;
  private timer: ReturnType<typeof setTimeout> | null = null;

  constructor(
    private readonly deliver: (changes: WorkspaceChanges) => void,
    private readonly delayMs = 100,
    private readonly maxChanges = 500,
  ) {}

  push(changes: readonly FileChange[]): void {
    for (const change of changes) {
      if (this.overflow) break;
      // The latest event per path wins (create + update = update, etc.).
      this.pending.set(change.path, change);
      if (this.pending.size > this.maxChanges) {
        this.overflow = true;
        this.pending.clear();
      }
    }
    this.timer ??= setTimeout(() => {
      this.flush();
    }, this.delayMs);
  }

  flush(): void {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    if (!this.overflow && this.pending.size === 0) return;
    const batch = { changes: [...this.pending.values()], overflow: this.overflow };
    this.pending.clear();
    this.overflow = false;
    this.deliver(batch);
  }

  dispose(): void {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    this.pending.clear();
  }
}
