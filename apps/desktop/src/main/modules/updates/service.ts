import type { UpdateStatus } from '@kestrel/shared';

/** The parts of electron-updater's autoUpdater we use (injectable for tests). */
export interface Updater {
  autoDownload: boolean;
  autoInstallOnAppQuit: boolean;
  checkForUpdates(): Promise<unknown>;
  downloadUpdate(): Promise<unknown>;
  quitAndInstall(): void;
  on(
    event: 'update-available' | 'update-downloaded',
    listener: (info: { version: string }) => void,
  ): unknown;
  on(event: 'update-not-available', listener: () => void): unknown;
  on(event: 'download-progress', listener: (progress: { percent: number }) => void): unknown;
  on(event: 'error', listener: (error: Error) => void): unknown;
}

export interface UpdateServiceDeps {
  updater: Updater | null;
  currentVersion: string;
  /** Packaged app and the user did not switch checks off. */
  enabled: () => boolean;
  onStatus: (status: UpdateStatus) => void;
  log: (line: string) => void;
}

/**
 * Checks GitHub releases for a newer version. Downloading and installing
 * only happen when the user asks; electron-updater verifies the file's
 * SHA-512 from the release's latest.yml.
 */
export class UpdateService {
  private status: UpdateStatus;

  constructor(private readonly deps: UpdateServiceDeps) {
    this.status = {
      state: deps.updater && deps.enabled() ? 'idle' : 'disabled',
      currentVersion: deps.currentVersion,
      version: null,
      percent: null,
    };
    const updater = deps.updater;
    if (!updater) return;
    updater.autoDownload = false;
    updater.autoInstallOnAppQuit = false;
    updater.on('update-available', ({ version }) => {
      this.set({ state: 'available', version, percent: null });
    });
    updater.on('update-not-available', () => {
      this.set({ state: 'upToDate', version: null, percent: null });
    });
    updater.on('download-progress', ({ percent }) => {
      this.set({ state: 'downloading', percent: Math.round(percent) });
    });
    updater.on('update-downloaded', ({ version }) => {
      this.set({ state: 'ready', version, percent: 100 });
    });
    updater.on('error', (error) => {
      // Offline or a private repository: not worth more than a log line.
      deps.log(`Update check failed: ${error.message.split('\n')[0] ?? ''}`);
      this.set({ state: 'error', percent: null });
    });
  }

  private set(patch: Partial<UpdateStatus>): void {
    this.status = { ...this.status, ...patch };
    this.deps.onStatus(this.status);
  }

  get(): UpdateStatus {
    return this.status;
  }

  async check(): Promise<UpdateStatus> {
    const { updater } = this.deps;
    if (!updater || !this.deps.enabled()) {
      this.set({ state: 'disabled' });
      return this.status;
    }
    if (this.status.state === 'downloading' || this.status.state === 'ready') return this.status;
    this.set({ state: 'checking' });
    try {
      await updater.checkForUpdates();
    } catch {
      // Reported through the 'error' event.
    }
    return this.status;
  }

  async download(): Promise<void> {
    if (this.status.state !== 'available' || !this.deps.updater) return;
    this.set({ state: 'downloading', percent: 0 });
    try {
      await this.deps.updater.downloadUpdate();
    } catch {
      // Reported through the 'error' event.
    }
  }

  install(): void {
    if (this.status.state === 'ready') this.deps.updater?.quitAndInstall();
  }
}
