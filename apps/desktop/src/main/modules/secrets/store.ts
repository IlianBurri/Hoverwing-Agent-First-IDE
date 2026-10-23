import { z } from 'zod';
import { readJsonFile, writeJsonFile } from '../../lib/jsonFile';

/** The parts of Electron's safeStorage we need (injectable for tests). */
export interface Encryption {
  isEncryptionAvailable(): boolean;
  encryptString(value: string): Buffer;
  decryptString(encrypted: Buffer): string;
}

const fileSchema = z.record(z.string(), z.string());

/**
 * Secrets (API keys, tokens) encrypted with the OS keychain via safeStorage.
 * Without a keychain, values are kept in memory for this session only and
 * never written to disk in plain text.
 */
export class SecretStore {
  private readonly memory = new Map<string, string>();
  private encrypted: Record<string, string> | null = null;

  constructor(
    private readonly file: string,
    private readonly encryption: Encryption,
  ) {}

  get persistent(): boolean {
    return this.encryption.isEncryptionAvailable();
  }

  private async load(): Promise<Record<string, string>> {
    this.encrypted ??= await readJsonFile(this.file, fileSchema, {});
    return this.encrypted;
  }

  async set(key: string, value: string | null): Promise<void> {
    const stored = await this.load();
    if (value === null) {
      this.memory.delete(key);
      if (key in stored) {
        const rest = Object.fromEntries(Object.entries(stored).filter(([entry]) => entry !== key));
        this.encrypted = rest;
        await writeJsonFile(this.file, rest);
      }
      return;
    }
    if (!this.persistent) {
      this.memory.set(key, value);
      return;
    }
    this.encrypted = { ...stored, [key]: this.encryption.encryptString(value).toString('base64') };
    await writeJsonFile(this.file, this.encrypted);
  }

  async get(key: string): Promise<string | null> {
    const fromMemory = this.memory.get(key);
    if (fromMemory !== undefined) return fromMemory;
    const value = (await this.load())[key];
    if (value === undefined || !this.persistent) return null;
    try {
      return this.encryption.decryptString(Buffer.from(value, 'base64'));
    } catch {
      return null;
    }
  }

  async has(key: string): Promise<boolean> {
    return (await this.get(key)) !== null;
  }
}
