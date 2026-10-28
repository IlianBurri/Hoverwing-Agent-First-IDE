import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { SecretStore } from './store';
import type { Encryption } from './store';

let dir: string;
beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'kestrel-secrets-'));
});
afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

/** Fake encryption: reversible, but the plain value never appears in the file. */
const fakeEncryption = (available: boolean): Encryption => ({
  isEncryptionAvailable: () => available,
  encryptString: (value) => Buffer.from(value.split('').reverse().join(''), 'utf8'),
  decryptString: (buffer) => buffer.toString('utf8').split('').reverse().join(''),
});

describe('SecretStore', () => {
  it('stores secrets encrypted and reads them back', async () => {
    const file = join(dir, 'secrets.json');
    const store = new SecretStore(file, fakeEncryption(true));
    await store.set('agent:claude:ANTHROPIC_API_KEY', 'sk-test-123');
    expect(await readFile(file, 'utf8')).not.toContain('sk-test-123');
    expect(
      await new SecretStore(file, fakeEncryption(true)).get('agent:claude:ANTHROPIC_API_KEY'),
    ).toBe('sk-test-123');
  });

  it('keeps secrets in memory only without a keychain', async () => {
    const file = join(dir, 'secrets.json');
    const store = new SecretStore(file, fakeEncryption(false));
    await store.set('key', 'value');
    expect(await store.get('key')).toBe('value');
    await expect(readFile(file, 'utf8')).rejects.toThrow();
  });

  it('deletes secrets', async () => {
    const store = new SecretStore(join(dir, 'secrets.json'), fakeEncryption(true));
    await store.set('key', 'value');
    await store.set('key', null);
    expect(await store.has('key')).toBe(false);
  });

  it('drops values another keychain key encrypted (after a rename)', async () => {
    const file = join(dir, 'secrets.json');
    await new SecretStore(file, fakeEncryption(true)).set('provider:a', 'sk-old');
    const otherKey: Encryption = {
      ...fakeEncryption(true),
      decryptString: (buffer) => {
        if (buffer.toString('utf8') !== 'wen') throw new Error('bad key');
        return 'new';
      },
      encryptString: () => Buffer.from('wen', 'utf8'),
    };
    const store = new SecretStore(file, otherKey);
    await store.set('provider:b', 'new');
    expect(await store.dropUnreadable()).toBe(1);
    expect(await store.has('provider:a')).toBe(false);
    expect(await store.get('provider:b')).toBe('new');
    expect(await new SecretStore(file, otherKey).dropUnreadable()).toBe(0);
  });
});
