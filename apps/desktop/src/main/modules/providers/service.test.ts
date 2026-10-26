import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ProviderConfig } from '@kestrel/shared';
import type { Endpoint } from './client';
import { ProviderConfigStore } from './configs';
import { ProviderService } from './service';
import { fakeModelClient, httpError, memorySecrets } from './testing';

let dir: string;

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'kestrel-providers-'));
});

afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

const router: ProviderConfig = {
  id: 'router',
  name: 'Router',
  template: 'openrouter',
  baseUrl: 'https://openrouter.ai/api/v1',
  models: ['a:free', 'b:free'],
};

function setUp(listModels?: () => Promise<string[]>) {
  const secrets = memorySecrets();
  const endpoints: Endpoint[] = [];
  const onChanged = vi.fn();
  const service = new ProviderService({
    configs: new ProviderConfigStore(join(dir, 'providers.json')),
    secrets,
    createClient: (endpoint) => {
      endpoints.push(endpoint);
      const client = fakeModelClient(() => 'hi');
      return listModels ? { ...client, listModels } : client;
    },
    onChanged,
  });
  return { service, secrets, endpoints, onChanged };
}

describe('ProviderService', () => {
  it('stores configs in the file and keys only in the secret store', async () => {
    const { service, secrets } = setUp();
    await service.save(router);
    await service.setApiKey('router', ' sk-or-secret ');
    const file = await readFile(join(dir, 'providers.json'), 'utf8');
    expect(file).toContain('openrouter.ai');
    expect(file).not.toContain('sk-or-secret');
    expect(secrets.values.get('provider:router')).toBe('sk-or-secret');
    expect(await service.list()).toEqual([{ ...router, apiKeySet: true }]);
  });

  it('forgets the key when the address changes', async () => {
    const { service } = setUp();
    await service.save(router);
    await service.setApiKey('router', 'sk-or-secret');
    await service.save({ ...router, name: 'Renamed' });
    expect((await service.list())[0]?.apiKeySet).toBe(true);
    await service.save({ ...router, baseUrl: 'https://evil.example/v1' });
    expect((await service.list())[0]?.apiKeySet).toBe(false);
  });

  it('removes the key with the provider', async () => {
    const { service, secrets, onChanged } = setUp();
    await service.save(router);
    await service.setApiKey('router', 'sk-or-secret');
    await service.delete('router');
    expect(secrets.values.size).toBe(0);
    expect(await service.list()).toEqual([]);
    expect(onChanged).toHaveBeenCalled();
  });

  it('puts the chosen model first and the others after it as fallbacks', async () => {
    const { service, endpoints } = setUp();
    await service.save(router);
    await service.setApiKey('router', 'sk-or-secret');
    const { models } = await service.resolve({ providerId: 'router', model: 'b:free' });
    expect(models).toEqual(['b:free', 'a:free']);
    expect(endpoints.at(-1)).toEqual({ baseUrl: router.baseUrl, apiKey: 'sk-or-secret' });
  });

  it('lists the models of the endpoint when testing', async () => {
    const { service } = setUp();
    await service.save(router);
    expect(await service.test('router')).toEqual({ models: ['a-model', 'b-model'] });
  });

  it('turns test failures into user errors', async () => {
    const { service } = setUp(() => Promise.reject(httpError(401)));
    await service.save(router);
    await expect(service.test('router')).rejects.toMatchObject({ code: 'provider_auth' });
    await expect(service.test('missing')).rejects.toMatchObject({ code: 'not_found' });
  });
});
