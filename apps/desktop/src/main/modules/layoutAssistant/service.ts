import { extractJson, layoutProposalSchema, mergeProposal } from '@kestrel/shared';
import type { LayoutState, ModelRef } from '@kestrel/shared';
import { UserError } from '../../ipc/errors';
import type { ChatTurn, ProviderService } from '../providers';
import { classifyModelError, toProviderUserError, withFallback } from '../providers';
import { correctionTurns, layoutPrompt } from './prompt';
import type { CommandInfo } from './prompt';

const TIMEOUT_MS = 90_000;
const MAX_TOKENS = 1500;

export interface LayoutAssistantDeps {
  providers: Pick<ProviderService, 'resolve'>;
  model: () => ModelRef | null;
  current: () => LayoutState;
  log?: (line: string) => void;
}

export interface LayoutResult {
  layout: LayoutState;
  explanation: string;
  model: string;
}

type Parsed = { ok: true; result: Omit<LayoutResult, 'model'> } | { ok: false; error: string };

/** Turns a model answer into a checked layout (or a short error for the retry). */
export function parseAnswer(
  answer: string,
  current: LayoutState,
  known: ReadonlySet<string>,
): Parsed {
  const json = extractJson(answer);
  if (json === null) return { ok: false, error: 'no JSON object found' };
  const parsed = layoutProposalSchema.safeParse(json);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return {
      ok: false,
      error: issue ? `${issue.path.join('.') || 'value'}: ${issue.message}` : 'invalid layout',
    };
  }
  try {
    return {
      ok: true,
      result: {
        layout: mergeProposal(current, parsed.data, known),
        explanation: parsed.data.explanation ?? '',
      },
    };
  } catch {
    return { ok: false, error: 'the merged layout is invalid' };
  }
}

/**
 * "Customize layout with AI": asks the chat model for a layout. The answer
 * is untrusted data – it is parsed and checked against the layout schemas,
 * with one chance to correct itself. Nothing is applied here.
 */
export class LayoutAssistant {
  constructor(private readonly deps: LayoutAssistantDeps) {}

  async propose(text: string, commands: readonly CommandInfo[]): Promise<LayoutResult> {
    const ref = this.deps.model();
    if (!ref) throw new UserError('model_not_set', 'No chat model chosen.');
    const { client, models } = await this.deps.providers.resolve(ref);
    const current = this.deps.current();
    const known = new Set(commands.map((command) => command.id));
    const signal = AbortSignal.timeout(TIMEOUT_MS);
    const ask = (model: string, messages: ChatTurn[]) =>
      client.chat({
        model,
        messages,
        signal,
        maxTokens: MAX_TOKENS,
        temperature: 0.2,
        json: true,
      });

    let outcome: { model: string; result: Parsed };
    try {
      outcome = await withFallback(models, async (model) => {
        const messages = layoutPrompt(current, commands, text);
        const answer = await ask(model, messages);
        const first = parseAnswer(answer, current, known);
        if (first.ok) return first;
        this.deps.log?.(`layout assistant: invalid answer (${first.error}), asking again`);
        return parseAnswer(
          await ask(model, [...messages, ...correctionTurns(answer, first.error)]),
          current,
          known,
        );
      });
    } catch (error) {
      throw toProviderUserError(classifyModelError(error));
    }
    // An invalid answer is not a provider failure: no other model is tried.
    if (!outcome.result.ok) {
      this.deps.log?.(`layout assistant: invalid again (${outcome.result.error})`);
      throw new UserError('layout_invalid', 'The model did not return a valid layout.');
    }
    return { ...outcome.result.result, model: outcome.model };
  }
}
