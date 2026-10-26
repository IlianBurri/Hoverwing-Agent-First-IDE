import { EventEmitter } from 'node:events';
import { describe, expect, it, vi } from 'vitest';
import type { UpdateStatus } from '@kestrel/shared';
import type { Updater } from './service';
import { UpdateService } from './service';

function fakeUpdater(next: () => void) {
  const emitter = new EventEmitter();
  const updater = {
    autoDownload: true,
    autoInstallOnAppQuit: true,
    checkForUpdates: vi.fn(() => {
      next.call(emitter);
      return Promise.resolve(null);
    }),
    downloadUpdate: vi.fn(() => {
      emitter.emit('download-progress', { percent: 42.4 });
      emitter.emit('update-downloaded', { version: '0.9.0' });
      return Promise.resolve([]);
    }),
    quitAndInstall: vi.fn(),
    on: (event: string, listener: (...args: unknown[]) => void) => emitter.on(event, listener),
  };
  return { updater, emitter };
}

function setUp(next: (this: EventEmitter) => void, enabled = true) {
  const { updater } = fakeUpdater(next);
  const statuses: UpdateStatus[] = [];
  const service = new UpdateService({
    // The fake has one loose on() instead of the typed overloads.
    updater: updater as unknown as Updater,
    currentVersion: '0.8.0',
    enabled: () => enabled,
    onStatus: (status) => statuses.push(status),
    log: vi.fn(),
  });
  return { service, updater, statuses };
}

describe('UpdateService', () => {
  it('never downloads or installs on its own', () => {
    const { updater } = setUp(() => undefined);
    expect(updater.autoDownload).toBe(false);
    expect(updater.autoInstallOnAppQuit).toBe(false);
  });

  it('reports a newer version, downloads it on request and installs when ready', async () => {
    const { service, updater, statuses } = setUp(function () {
      this.emit('update-available', { version: '0.9.0' });
    });
    expect(await service.check()).toMatchObject({ state: 'available', version: '0.9.0' });
    service.install();
    expect(updater.quitAndInstall).not.toHaveBeenCalled();
    await service.download();
    expect(statuses.map((status) => status.state)).toContain('downloading');
    expect(service.get()).toMatchObject({ state: 'ready', percent: 100 });
    service.install();
    expect(updater.quitAndInstall).toHaveBeenCalled();
  });

  it('reports errors and respects a switched-off check', async () => {
    const failing = setUp(function () {
      this.emit('error', new Error('HttpError: 404\nlong body'));
    });
    expect((await failing.service.check()).state).toBe('error');
    const off = setUp(() => undefined, false);
    expect((await off.service.check()).state).toBe('disabled');
    expect(off.updater.checkForUpdates).not.toHaveBeenCalled();
  });
});
