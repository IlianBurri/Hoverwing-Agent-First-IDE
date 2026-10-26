import { describe, expect, it } from 'vitest';
import { providerChannels } from '../ipc/channels/providers';
import { isFreeModel, isLocalEndpoint, providerConfigSchema, providerTemplates } from './providers';

describe('providers', () => {
  it('recognizes endpoints on this computer', () => {
    expect(isLocalEndpoint('http://localhost:11434/v1')).toBe(true);
    expect(isLocalEndpoint('http://127.0.0.1:8080/v1')).toBe(true);
    expect(isLocalEndpoint('http://[::1]:8080/v1')).toBe(true);
    expect(isLocalEndpoint('https://openrouter.ai/api/v1')).toBe(false);
    expect(isLocalEndpoint('http://localhost.evil.example/v1')).toBe(false);
  });

  it('marks free models', () => {
    expect(isFreeModel('qwen/qwen3-coder:free')).toBe(true);
    expect(isFreeModel('qwen2.5-coder:1.5b')).toBe(false);
  });

  it('accepts the templates and rejects odd addresses', () => {
    for (const info of providerTemplates.filter((entry) => entry.template !== 'custom')) {
      const config = {
        id: info.template,
        name: info.name,
        template: info.template,
        baseUrl: info.baseUrl,
        models: [info.model],
      };
      expect(providerConfigSchema.safeParse(config).success).toBe(true);
    }
    const base = { id: 'x', name: 'X', template: 'custom', models: ['m'] };
    expect(providerConfigSchema.safeParse({ ...base, baseUrl: 'file:///etc' }).success).toBe(false);
    expect(providerConfigSchema.safeParse({ ...base, baseUrl: 'https://a b' }).success).toBe(false);
    expect(
      providerConfigSchema.safeParse({ ...base, baseUrl: 'https://a', models: [] }).success,
    ).toBe(false);
  });

  it('never returns API keys to the window', () => {
    const view = providerChannels['providers:list'].response.element;
    expect(Object.keys(view.shape)).not.toContain('apiKey');
    expect(Object.keys(view.shape)).toContain('apiKeySet');
  });
});
