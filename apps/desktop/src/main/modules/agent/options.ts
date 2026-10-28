import { z } from 'zod';
import type { SessionConfigOption, SessionModeState } from '@agentclientprotocol/sdk';
import type { AgentOption, AgentOptionChoice, AgentOptionValue } from '@kestrel/shared';

/** How a Kestrel option is changed on the agent's side. */
export type OptionSource = 'config' | 'mode' | 'model';

export interface SessionOption {
  option: AgentOption;
  source: OptionSource;
}

/** Ids of options Kestrel builds from `modes` / `models` (no ACP config option). */
export const MODE_OPTION_ID = 'kestrel-mode';
export const MODEL_OPTION_ID = 'kestrel-model';

/**
 * Modes in which the agent acts without asking first (Claude Code's
 * "Bypass permissions" and "Auto", Gemini's "yolo"). Kestrel never offers
 * them: every risky action has to reach the permission service.
 */
const UNSAFE_MODES = new Set(['bypassPermissions', 'auto', 'dontAsk', 'yolo']);

export function isUnsafeMode(value: string): boolean {
  return UNSAFE_MODES.has(value);
}

/**
 * The model list some agents (Gemini CLI) send outside the stable protocol
 * (`models` in the session response, changed with `session/set_model`).
 */
const unstableModelsSchema = z.object({
  models: z.object({
    currentModelId: z.string(),
    availableModels: z
      .array(
        z.object({
          modelId: z.string(),
          name: z.string(),
          description: z.string().nullish(),
        }),
      )
      .min(1),
  }),
});

const KNOWN_TYPES = new Set<string>(['boolean', 'select']);

function categoryOf(option: SessionConfigOption): AgentOption['category'] {
  switch (option.category) {
    case 'model':
      return 'model';
    case 'thought_level':
      return 'effort';
    case 'mode':
      return 'mode';
    default:
      return 'other';
  }
}

function withoutUnsafe(
  category: AgentOption['category'],
  choices: AgentOptionChoice[],
  current: string,
): AgentOptionChoice[] {
  if (category !== 'mode') return choices;
  // The current value stays visible (the agent may start in it), but cannot be chosen again.
  return choices.filter((choice) => !isUnsafeMode(choice.value) || choice.value === current);
}

function fromConfigOption(option: SessionConfigOption): AgentOption {
  const base = {
    id: option.id,
    name: option.name,
    description: option.description ?? null,
    category: categoryOf(option),
  };
  if (option.type === 'boolean') return { ...base, value: option.currentValue, choices: [] };
  const choices: AgentOptionChoice[] = [];
  for (const entry of option.options) {
    if ('group' in entry) {
      for (const value of entry.options)
        choices.push({
          value: value.value,
          name: value.name,
          description: value.description ?? null,
          group: entry.name,
        });
    } else {
      choices.push({
        value: entry.value,
        name: entry.name,
        description: entry.description ?? null,
        group: null,
      });
    }
  }
  return {
    ...base,
    value: option.currentValue,
    choices: withoutUnsafe(base.category, choices, option.currentValue),
  };
}

/** Kestrel's options from a session/new or session/load response. */
export function sessionOptions(response: {
  configOptions?: SessionConfigOption[] | null;
  modes?: SessionModeState | null;
}): SessionOption[] {
  const options: SessionOption[] = (response.configOptions ?? [])
    // Agents may send option types newer than this client knows.
    .filter((option) => KNOWN_TYPES.has(option.type))
    .map((option) => ({ option: fromConfigOption(option), source: 'config' }));
  const has = (category: AgentOption['category']) =>
    options.some((entry) => entry.option.category === category);

  if (!has('mode') && response.modes && response.modes.availableModes.length > 0) {
    const { currentModeId, availableModes } = response.modes;
    const choices = availableModes.map((mode) => ({
      value: mode.id,
      name: mode.name,
      description: mode.description ?? null,
      group: null,
    }));
    options.push({
      source: 'mode',
      option: {
        id: MODE_OPTION_ID,
        name: 'Mode',
        description: null,
        category: 'mode',
        value: currentModeId,
        choices: withoutUnsafe('mode', choices, currentModeId),
      },
    });
  }

  const models = unstableModelsSchema.safeParse(response);
  if (!has('model') && models.success) {
    const { currentModelId, availableModels } = models.data.models;
    options.push({
      source: 'model',
      option: {
        id: MODEL_OPTION_ID,
        name: 'Model',
        description: null,
        category: 'model',
        value: currentModelId,
        choices: availableModels.map((model) => ({
          value: model.modelId,
          name: model.name,
          description: model.description ?? null,
          group: null,
        })),
      },
    });
  }
  return options;
}

/** Replaces the config options (after an update) and keeps Kestrel's own ones. */
export function replaceConfigOptions(
  current: readonly SessionOption[],
  configOptions: SessionConfigOption[],
): SessionOption[] {
  const next = sessionOptions({ configOptions });
  const has = (category: AgentOption['category']) =>
    next.some((entry) => entry.option.category === category);
  for (const entry of current) {
    if (entry.source !== 'config' && !has(entry.option.category)) next.push(entry);
  }
  return next;
}

/** A new value for one option (e.g. after `current_mode_update`). */
export function withValue(
  current: readonly SessionOption[],
  id: string,
  value: AgentOptionValue,
): SessionOption[] {
  return current.map((entry) =>
    entry.option.id === id ? { ...entry, option: { ...entry.option, value } } : entry,
  );
}

/** Whether `value` may be set for `option` (type and allowed choices). */
export function isValidValue(option: AgentOption, value: AgentOptionValue): boolean {
  if (typeof option.value === 'boolean') return typeof value === 'boolean';
  if (typeof value !== 'string') return false;
  if (option.category === 'mode' && isUnsafeMode(value)) return false;
  return option.choices.some((choice) => choice.value === value);
}
