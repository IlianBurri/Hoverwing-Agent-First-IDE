import { isSensitivePath } from '@kestrel/shared';
import type { Chat, ChatAttachment, ChatEvent, ChatSummary, ModelRef } from '@kestrel/shared';
import { UserError } from '../../ipc/errors';
import type { ProviderService } from '../providers';
import { classifyModelError, withFallback } from '../providers';
import type { ChatStore } from './store';
import { chatTitle, chatTurns } from './prompt';

export interface ChatServiceDeps {
  providers: Pick<ProviderService, 'resolve'>;
  store: Pick<ChatStore, 'get' | 'save' | 'delete' | 'list'>;
  /** The chat model from the settings. */
  model: () => ModelRef | null;
  emit: (ownerId: number, chatId: string, event: ChatEvent) => void;
  now?: () => number;
}

interface Running {
  chatId: string;
  controller: AbortController;
  done: Promise<void>;
}

/**
 * The built-in chat: one streamed answer per window at a time. The model
 * gets the conversation and attached files only; it has no tools.
 */
export class ChatService {
  private readonly running = new Map<number, Running>();

  constructor(private readonly deps: ChatServiceDeps) {}

  async send(
    ownerId: number,
    request: { chatId: string; text: string; attachment: ChatAttachment | null },
  ): Promise<{ chatId: string }> {
    if (request.attachment && isSensitivePath(request.attachment.path)) {
      throw new UserError('secret_file', 'Secret files are never sent to a model.');
    }
    const ref = this.deps.model();
    if (!ref) throw new UserError('model_not_set', 'No chat model chosen.');
    const { client, models } = await this.deps.providers.resolve(ref);
    await this.stop(ownerId);

    const now = this.deps.now?.() ?? Date.now();
    let chat: Chat = (await this.deps.store.get(request.chatId)) ?? {
      id: request.chatId,
      title: chatTitle(request.text),
      time: now,
      messages: [],
    };
    chat = {
      ...chat,
      time: now,
      messages: [
        ...chat.messages,
        { role: 'user', text: request.text, attachment: request.attachment, model: null },
      ],
    };
    await this.deps.store.save(chat);

    const controller = new AbortController();
    const emit = (event: ChatEvent) => {
      this.deps.emit(ownerId, chat.id, event);
    };
    const done = (async () => {
      let answer = '';
      let answeredBy: string | null = null;
      let failed: ChatEvent | null = null;
      try {
        const { model } = await withFallback(
          models,
          async (model) => {
            answeredBy = model;
            emit({ type: 'started', model });
            await client.streamChat(
              { model, messages: chatTurns(chat.messages), signal: controller.signal },
              (text) => {
                answer += text;
                emit({ type: 'delta', text });
              },
            );
          },
          (from, to, error) => {
            emit({ type: 'fallback', from, to, error });
          },
          () => answer === '' && !controller.signal.aborted,
        );
        answeredBy = model;
      } catch (error) {
        const classified = classifyModelError(error);
        if (classified.kind !== 'cancelled' && !controller.signal.aborted) {
          failed = { type: 'error', error: classified };
        }
      }
      if (answer) {
        chat = {
          ...chat,
          messages: [
            ...chat.messages,
            { role: 'assistant', text: answer, attachment: null, model: answeredBy },
          ],
        };
        await this.deps.store.save(chat).catch(() => undefined);
      }
      emit(failed ?? { type: 'done', stopped: controller.signal.aborted });
    })().finally(() => {
      if (this.running.get(ownerId)?.controller === controller) this.running.delete(ownerId);
    });
    this.running.set(ownerId, { chatId: chat.id, controller, done });
    return { chatId: chat.id };
  }

  /** Stops the window's answer (what arrived so far is kept). */
  async stop(ownerId: number): Promise<void> {
    const running = this.running.get(ownerId);
    if (!running) return;
    running.controller.abort();
    await running.done;
  }

  release(ownerId: number): void {
    void this.stop(ownerId);
  }

  list(): Promise<ChatSummary[]> {
    return this.deps.store.list();
  }

  async load(id: string): Promise<Chat> {
    const chat = await this.deps.store.get(id);
    if (!chat) throw new UserError('not_found', 'Unknown chat.');
    return chat;
  }

  async delete(ownerId: number, id: string): Promise<void> {
    if (this.running.get(ownerId)?.chatId === id) await this.stop(ownerId);
    await this.deps.store.delete(id);
  }
}
