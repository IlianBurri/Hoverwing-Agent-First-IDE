import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { migrateUserData } from './migrateUserData';

let dir: string;
let oldDir: string;
let newDir: string;

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'kestrel-migrate-'));
  oldDir = join(dir, 'Kestrel');
  newDir = join(dir, 'Hoverwing');
});

afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

describe('migrateUserData', () => {
  it('copies the old app data once, without caches, and keeps the old folder', () => {
    mkdirSync(join(oldDir, 'agent-sessions'), { recursive: true });
    mkdirSync(join(oldDir, 'Cache'));
    writeFileSync(join(oldDir, 'settings.json'), '{"theme":"light"}');
    writeFileSync(join(oldDir, 'agent-sessions', 'sessions-1.json'), '[]');
    writeFileSync(join(oldDir, 'Cache', 'data_0'), 'x');

    expect(migrateUserData(oldDir, newDir)).toBe(true);
    expect(readFileSync(join(newDir, 'settings.json'), 'utf8')).toBe('{"theme":"light"}');
    expect(existsSync(join(newDir, 'agent-sessions', 'sessions-1.json'))).toBe(true);
    expect(existsSync(join(newDir, 'Cache'))).toBe(false);
    expect(existsSync(join(oldDir, 'settings.json'))).toBe(true);

    // Never again once the new folder exists.
    writeFileSync(join(oldDir, 'settings.json'), '{"theme":"dark"}');
    expect(migrateUserData(oldDir, newDir)).toBe(false);
    expect(readFileSync(join(newDir, 'settings.json'), 'utf8')).toBe('{"theme":"light"}');
  });

  it('also copies into a folder Electron already created, keeping its files', () => {
    mkdirSync(oldDir);
    mkdirSync(newDir);
    writeFileSync(join(oldDir, 'settings.json'), '{"theme":"light"}');
    writeFileSync(join(oldDir, 'Local State'), 'old');
    writeFileSync(join(newDir, 'Local State'), 'new');
    expect(migrateUserData(oldDir, newDir)).toBe(true);
    expect(readFileSync(join(newDir, 'settings.json'), 'utf8')).toBe('{"theme":"light"}');
    expect(readFileSync(join(newDir, 'Local State'), 'utf8')).toBe('new');
  });

  it('does nothing without old data', () => {
    expect(migrateUserData(oldDir, newDir)).toBe(false);
    mkdirSync(oldDir);
    expect(migrateUserData(oldDir, newDir)).toBe(false);
    expect(existsSync(newDir)).toBe(false);
  });
});
