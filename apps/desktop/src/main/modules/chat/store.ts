import { readdir, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { chatSchema } from '@kestrel/shared';
import type { Chat, ChatSummary } from '@kestrel/shared';
import { readJsonFile, writeJsonFile } from '../../lib/jsonFile';

const MAX_LISTED = 50;

/** Chats as one JSON file each, in the app data folder. */
export class ChatStore {
  constructor(private readonly dir: string) {}

  private file(id: string): string {
    return join(this.dir, `${id}.json`);
  }

  async get(id: string): Promise<Chat | null> {
    return readJsonFile<Chat | null>(this.file(id), chatSchema, null);
  }

  async save(chat: Chat): Promise<void> {
    await writeJsonFile(this.file(chat.id), chat);
  }

  async delete(id: string): Promise<void> {
    await rm(this.file(id), { force: true });
  }

  /** Newest first. */
  async list(): Promise<ChatSummary[]> {
    let names: string[];
    try {
      names = await readdir(this.dir);
    } catch {
      return [];
    }
    const chats = await Promise.all(
      names
        .filter((name) => name.endsWith('.json'))
        .map((name) => this.get(name.slice(0, -'.json'.length))),
    );
    return chats
      .filter((chat): chat is Chat => chat !== null)
      .map(({ id, title, time }) => ({ id, title, time }))
      .sort((a, b) => b.time - a.time)
      .slice(0, MAX_LISTED);
  }
}
