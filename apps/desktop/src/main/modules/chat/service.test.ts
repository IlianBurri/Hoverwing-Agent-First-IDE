import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { ChatEvent, ModelRef } from '@kestrel/shared';
import type { ModelClient } from '../providers';
import { fakeModelClient, httpError } from '../providers/testing';
import type { FakeModelCall } from '../providers/testing';
import { chatTitle, chatTurns } from './prompt';
import { ChatService } from './service';
import { ChatStore } from './store';

let dir: string;

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'kestrel-chat-'));
});

afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

function setUp(
  answer: (call: FakeModelCall) => string,
  model: ModelRef | null = { providerId: 'p', model: 'first' },
  wrap: (client: ModelClient) => ModelClient = (client) => client,
) {
  const client = fakeModelClient(answer);
  const events: ChatEvent[] = [];
  let terminal = 0;
  const waiters: [number, () => void][] = [];
  const service = new ChatService({
    providers: {
      resolve: (ref) => Promise.resolve({ client: wrap(client), models: [ref.model, 'second'] }),
    },
    store: new ChatStore(dir),
    model: () => model,
    emit: (_ownerId, _chatId, event) => {
      events.push(event);
      if (event.type !== 'done' && event.type !== 'error') return;
      terminal += 1;
      for (const [count, resolve] of waiters) if (count <= terminal) resolve();
    },
  });
  /** Resolves when `count` answers are complete. */
  const finished = (count = 1) =>
    new Promise<void>((resolve) => {
      if (terminal >= count) resolve();
      else waiters.push([count, resolve]);
    });
  return { service, client, events, finished };
}

describe('ChatService', () => {
  it('streams an answer and stores the conversation', async () => {
    const { service, finished, events } = setUp(() => 'Hello there friend');
    const { chatId } = await service.send(1, { chatId: 'c-1', text: 'Hi', attachment: null });
    await finished();
    const text = events.flatMap((event) => (event.type === 'delta' ? [event.text] : [])).join('');
    expect(text).toBe('Hello there friend');
    expect(events.at(-1)).toEqual({ type: 'done', stopped: false });
    const chat = await service.load(chatId);
    expect(chat.messages.map((message) => [message.role, message.text, message.model])).toEqual([
      ['user', 'Hi', null],
      ['assistant', 'Hello there friend', 'first'],
    ]);
    expect(await service.list()).toEqual([{ id: chatId, title: 'Hi', time: chat.time }]);
  });

  it('continues a chat with its history', async () => {
    const { service, finished, client } = setUp(() => 'ok');
    const { chatId } = await service.send(1, { chatId: 'c-1', text: 'One', attachment: null });
    await finished();
    await service.send(1, { chatId, text: 'Two', attachment: null });
    await finished(2);
    const sent = client.calls.at(-1)?.messages?.map((turn) => turn.content);
    expect(sent?.slice(1)).toEqual(['One', 'ok', 'Two']);
  });

  it('falls back to the next model after a rate limit', async () => {
    const { service, finished, events } = setUp((call) => {
      if (call.model === 'first') throw httpError(429, { 'retry-after': '5' });
      return 'from second';
    });
    const { chatId } = await service.send(1, { chatId: 'c-1', text: 'Hi', attachment: null });
    await finished();
    expect(events).toContainEqual({
      type: 'fallback',
      from: 'first',
      to: 'second',
      error: { kind: 'rateLimited', retryAfter: 5 },
    });
    expect((await service.load(chatId)).messages.at(-1)?.model).toBe('second');
  });

  it('reports errors in plain kinds', async () => {
    const { service, finished, events } = setUp(() => {
      throw httpError(401);
    });
    await service.send(1, { chatId: 'c-1', text: 'Hi', attachment: null });
    await finished();
    expect(events.at(-1)).toEqual({ type: 'error', error: { kind: 'auth', retryAfter: null } });
  });

  it('keeps what arrived when the user stops', async () => {
    let release: () => void = () => undefined;
    const { service, events } = setUp(
      () => '',
      undefined,
      (client) => ({
        ...client,
        streamChat: ({ signal }, onDelta) => {
          onDelta('partial ');
          return new Promise<void>((_resolve, reject) => {
            release = () => {
              reject(new DOMException('Aborted', 'AbortError'));
            };
            signal.addEventListener('abort', release);
          });
        },
      }),
    );
    const { chatId } = await service.send(1, { chatId: 'c-1', text: 'Hi', attachment: null });
    await service.stop(1);
    expect(events.at(-1)).toEqual({ type: 'done', stopped: true });
    expect((await service.load(chatId)).messages.at(-1)?.text).toBe('partial ');
  });

  it('never sends secret files and needs a chosen model', async () => {
    const { service } = setUp(() => 'x');
    await expect(
      service.send(1, {
        chatId: 'c-1',
        text: 'Look',
        attachment: { path: '.env', language: 'dotenv', lines: null, text: 'KEY=1' },
      }),
    ).rejects.toMatchObject({ code: 'secret_file' });
    const unset = setUp(() => 'x', null);
    await expect(
      unset.service.send(1, { chatId: 'c-1', text: 'Hi', attachment: null }),
    ).rejects.toMatchObject({ code: 'model_not_set' });
  });
});

describe('chat prompt', () => {
  it('marks attached files as data in a safe fence', () => {
    const turns = chatTurns([
      {
        role: 'user',
        text: 'Explain',
        attachment: {
          path: 'src/a.md',
          language: 'markdown',
          lines: { start: 2, end: 4 },
          text: '```js\nx\n```',
        },
        model: null,
      },
    ]);
    const content = turns[1]?.content ?? '';
    expect(turns[0]?.role).toBe('system');
    expect(content).toContain('<attached-file path="src/a.md, lines 2-4">');
    expect(content).toContain('````markdown\n```js\nx\n```\n````');
  });

  it('drops the oldest messages when the history is too long', () => {
    const message = (text: string) =>
      ({ role: 'user', text, attachment: null, model: null }) as const;
    const turns = chatTurns([message('a'.repeat(50)), message('b'.repeat(50))], 80);
    expect(turns.map((turn) => turn.content[0])).toEqual(['Y', 'b']);
  });

  it('builds short one-line titles', () => {
    expect(chatTitle('  Why\n does this  fail? ')).toBe('Why does this fail?');
    expect(chatTitle('x'.repeat(100))).toHaveLength(60);
  });
});
