/**
 * Collects terminal output for a few milliseconds and sends it as one
 * message. `npm install` or `cat bigfile` would otherwise produce thousands
 * of tiny IPC messages per second.
 */
export class OutputBatcher {
  private chunks: string[] = [];
  private size = 0;
  private timer: ReturnType<typeof setTimeout> | null = null;

  constructor(
    private readonly deliver: (data: string) => void,
    private readonly delayMs = 8,
    private readonly maxSize = 100_000,
  ) {}

  push(data: string): void {
    this.chunks.push(data);
    this.size += data.length;
    if (this.size >= this.maxSize) {
      this.flush();
      return;
    }
    this.timer ??= setTimeout(() => {
      this.flush();
    }, this.delayMs);
  }

  flush(): void {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    if (this.chunks.length === 0) return;
    const data = this.chunks.join('');
    this.chunks = [];
    this.size = 0;
    this.deliver(data);
  }
}
