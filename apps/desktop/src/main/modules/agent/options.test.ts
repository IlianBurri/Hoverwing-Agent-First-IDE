import { describe, expect, it } from 'vitest';
import type { SessionConfigOption } from '@agentclientprotocol/sdk';
import {
  MODEL_OPTION_ID,
  MODE_OPTION_ID,
  isValidValue,
  replaceConfigOptions,
  sessionOptions,
} from './options';

const claudeOptions: SessionConfigOption[] = [
  {
    id: 'model',
    name: 'Model',
    category: 'model',
    type: 'select',
    currentValue: 'default',
    options: [
      { value: 'default', name: 'Default' },
      { value: 'opus[1m]', name: 'Opus (1M context)' },
    ],
  },
  {
    id: 'effort',
    name: 'Effort',
    category: 'thought_level',
    type: 'select',
    currentValue: 'medium',
    options: [
      {
        group: 'levels',
        name: 'Levels',
        options: [
          { value: 'low', name: 'Low' },
          { value: 'medium', name: 'Medium' },
          { value: 'high', name: 'High' },
        ],
      },
    ],
  },
  {
    id: 'mode',
    name: 'Mode',
    category: 'mode',
    type: 'select',
    currentValue: 'default',
    options: [
      { value: 'default', name: 'Manual' },
      { value: 'plan', name: 'Plan' },
      { value: 'auto', name: 'Auto' },
      { value: 'bypassPermissions', name: 'Bypass permissions' },
    ],
  },
  { id: 'fast', name: 'Fast', type: 'boolean', currentValue: false },
];

describe('sessionOptions', () => {
  it('translates config options with categories and flattened groups', () => {
    const options = sessionOptions({ configOptions: claudeOptions }).map((entry) => entry.option);
    expect(options.map((option) => [option.id, option.category])).toEqual([
      ['model', 'model'],
      ['effort', 'effort'],
      ['mode', 'mode'],
      ['fast', 'other'],
    ]);
    expect(options[1]?.choices.map((choice) => [choice.value, choice.group])).toEqual([
      ['low', 'Levels'],
      ['medium', 'Levels'],
      ['high', 'Levels'],
    ]);
    expect(options[3]).toMatchObject({ value: false, choices: [] });
  });

  it('never offers modes that skip the permission questions', () => {
    const mode = sessionOptions({ configOptions: claudeOptions })[2]?.option;
    expect(mode?.choices.map((choice) => choice.value)).toEqual(['default', 'plan']);
    expect(mode && isValidValue(mode, 'bypassPermissions')).toBe(false);
    expect(mode && isValidValue(mode, 'plan')).toBe(true);
  });

  it('keeps an unsafe mode visible when the agent started in it', () => {
    const [entry] = sessionOptions({
      modes: {
        currentModeId: 'yolo',
        availableModes: [
          { id: 'default', name: 'Default' },
          { id: 'yolo', name: 'YOLO' },
        ],
      },
    });
    expect(entry?.option.choices.map((choice) => choice.value)).toEqual(['default', 'yolo']);
    expect(entry && isValidValue(entry.option, 'yolo')).toBe(false);
  });

  it('builds mode and model options from modes and the unstable model list', () => {
    const response = {
      sessionId: 's',
      modes: { currentModeId: 'default', availableModes: [{ id: 'default', name: 'Default' }] },
      models: {
        currentModelId: 'gemini-pro',
        availableModels: [
          { modelId: 'gemini-pro', name: 'Gemini Pro' },
          { modelId: 'gemini-flash', name: 'Gemini Flash', description: 'Fast' },
        ],
      },
    };
    const options = sessionOptions(response);
    expect(options.map((entry) => [entry.option.id, entry.source])).toEqual([
      [MODE_OPTION_ID, 'mode'],
      [MODEL_OPTION_ID, 'model'],
    ]);
    expect(options[1]?.option.value).toBe('gemini-pro');
  });

  it('prefers config options over modes and models of the same kind', () => {
    const options = sessionOptions({
      configOptions: claudeOptions,
      modes: { currentModeId: 'default', availableModes: [{ id: 'default', name: 'Default' }] },
    });
    expect(options.some((entry) => entry.source === 'mode')).toBe(false);
  });
});

describe('replaceConfigOptions', () => {
  it('replaces config options and keeps the ones built from modes', () => {
    const current = sessionOptions({
      modes: { currentModeId: 'default', availableModes: [{ id: 'default', name: 'Default' }] },
    });
    const next = replaceConfigOptions(current, [claudeOptions[0] as SessionConfigOption]);
    expect(next.map((entry) => entry.option.id)).toEqual(['model', MODE_OPTION_ID]);
  });
});

describe('isValidValue', () => {
  it('checks the type and the listed values', () => {
    const [model, , , fast] = sessionOptions({ configOptions: claudeOptions }).map(
      (entry) => entry.option,
    );
    if (!model || !fast) throw new Error('missing options');
    expect(isValidValue(model, 'opus[1m]')).toBe(true);
    expect(isValidValue(model, 'other')).toBe(false);
    expect(isValidValue(model, true)).toBe(false);
    expect(isValidValue(fast, true)).toBe(true);
    expect(isValidValue(fast, 'true')).toBe(false);
  });
});
