import { isSensitivePath } from '@kestrel/shared';
import type {
  CompletionRequest,
  CompletionResult,
  CompletionSettings,
  FimMode,
} from '@kestrel/shared';
import type { ModelClient, ProviderService } from '../providers';
import { classifyModelError, withFallback } from '../providers';
import { cleanCompletion, completionMessages } from './prompt';

export interface CompletionServiceDeps {
  providers: Pick<ProviderService, 'resolve'>;
  settings: () => CompletionSettings;
  timeoutMs?: number;
}

const MAX_TOKENS = 128;
const NOTHING: CompletionResult = { text: '', error: null };

interface Running {
  requestId: number;
  controller: AbortController;
}

/**
 * Inline suggestions. Only the newest request per window runs; older ones
 * are aborted, so a slow model never piles up work while the user types.
 */
export class CompletionService {
  private readonly running = new Map<number, Running>();
  /** provider/model pairs whose endpoint rejected fill-in-the-middle. */
  private readonly noFim = new Set<string>();

  constructor(private readonly deps: CompletionServiceDeps) {}

  async complete(ownerId: number, request: CompletionRequest): Promise<CompletionResult> {
    const settings = this.deps.settings();
    if (
      !settings.enabled ||
      !settings.model ||
      settings.disabledLanguages.includes(request.language) ||
      // Secrets never go to a model, not even as context.
      isSensitivePath(request.path)
    ) {
      return NOTHING;
    }
    this.running.get(ownerId)?.controller.abort();
    const controller = new AbortController();
    this.running.set(ownerId, { requestId: request.requestId, controller });
    const timeout = { hit: false };
    const timer = setTimeout(() => {
      timeout.hit = true;
      controller.abort();
    }, this.deps.timeoutMs ?? 10_000);

    try {
      const ref = settings.model;
      const { client, models } = await this.deps.providers.resolve(ref);
      const { result } = await withFallback(models, (model) =>
        this.ask(client, `${ref.providerId}/${model}`, model, request, settings.fim, controller),
      );
      if (controller.signal.aborted) return NOTHING;
      return { text: cleanCompletion(result, request.prefix, request.suffix), error: null };
    } catch (error) {
      if (timeout.hit) return { text: '', error: 'unreachable' };
      const { kind } = classifyModelError(error);
      return kind === 'cancelled' || controller.signal.aborted
        ? NOTHING
        : { text: '', error: kind };
    } finally {
      clearTimeout(timer);
      if (this.running.get(ownerId)?.controller === controller) this.running.delete(ownerId);
    }
  }

  private async ask(
    client: ModelClient,
    key: string,
    model: string,
    request: CompletionRequest,
    fim: FimMode,
    controller: AbortController,
  ): Promise<string> {
    const options = { model, signal: controller.signal, maxTokens: MAX_TOKENS, temperature: 0.2 };
    if (fim !== 'off' && !this.noFim.has(key)) {
      try {
        return await client.complete({
          ...options,
          prompt: request.prefix,
          suffix: request.suffix,
          stop: ['\n\n\n'],
        });
      } catch (error) {
        const { kind } = classifyModelError(error);
        // "auto": an endpoint without FIM gets the chat prompt from now on.
        if (fim !== 'auto' || (kind !== 'badRequest' && kind !== 'modelMissing')) throw error;
        this.noFim.add(key);
      }
    }
    return client.chat({ ...options, messages: completionMessages(request) });
  }

  cancel(ownerId: number, requestId: number): void {
    const running = this.running.get(ownerId);
    if (running?.requestId === requestId) running.controller.abort();
  }

  release(ownerId: number): void {
    this.running.get(ownerId)?.controller.abort();
    this.running.delete(ownerId);
  }
}
