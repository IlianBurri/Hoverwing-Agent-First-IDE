import { describe, expect, it } from 'vitest';
import type { CompletionRequest, CompletionSettings } from '@kestrel/shared';
import { defaultCompletionSettings } from '@kestrel/shared';
import type { ModelClient } from '../providers';
import { fakeModelClient, httpError } from '../providers/testing';
import type { FakeModelCall } from '../providers/testing';
import { CURSOR, cleanCompletion, completionMessages } from './prompt';
import { CompletionService } from './service';

const enabled: CompletionSettings = {
  ...defaultCompletionSettings,
  enabled: true,
  model: { providerId: 'local', model: 'coder' },
};

const request = (patch: Partial<CompletionRequest> = {}): CompletionRequest => ({
  requestId: 1,
  path: 'src/a.ts',
  language: 'typescript',
  prefix: 'const x = ',
  suffix: ';\n',
  ...patch,
});

function setUp(
  answer: (call: FakeModelCall) => string,
  settings: CompletionSettings = enabled,
  wrap: (client: ModelClient) => ModelClient = (client) => client,
) {
  const client = fakeModelClient(answer);
  const service = new CompletionService({
    providers: { resolve: (ref) => Promise.resolve({ client: wrap(client), models: [ref.model] }) },
    settings: () => settings,
    timeoutMs: 200,
  });
  return { service, client };
}

describe('CompletionService', () => {
  it('uses fill-in-the-middle with prefix and suffix', async () => {
    const { service, client } = setUp(() => '42');
    expect(await service.complete(1, request())).toEqual({ text: '42', error: null });
    expect(client.calls).toEqual([
      { kind: 'complete', model: 'coder', prompt: 'const x = ', suffix: ';\n' },
    ]);
  });

  it('switches to a chat prompt when the endpoint has no FIM, and remembers it', async () => {
    const { service, client } = setUp((call) => {
      if (call.kind === 'complete') throw httpError(404);
      return '42';
    });
    expect((await service.complete(1, request())).text).toBe('42');
    expect((await service.complete(1, request({ requestId: 2 }))).text).toBe('42');
    expect(client.calls.map((call) => call.kind)).toEqual(['complete', 'chat', 'chat']);
  });

  it('never asks for secret files, disabled languages or when switched off', async () => {
    const { service, client } = setUp(() => 'x');
    await service.complete(1, request({ path: 'config/.env' }));
    await service.complete(1, request({ language: 'markdown' }));
    const off = setUp(() => 'x', { ...enabled, enabled: false });
    await off.service.complete(1, request());
    expect(client.calls).toEqual([]);
    expect(off.client.calls).toEqual([]);
  });

  it('aborts the previous request of the window', async () => {
    const { service } = setUp(
      () => 'x',
      enabled,
      (client) => ({
        ...client,
        complete: ({ signal }) =>
          new Promise((resolve, reject) => {
            signal.addEventListener('abort', () => {
              reject(new DOMException('Aborted', 'AbortError'));
            });
            setTimeout(() => {
              resolve('late');
            }, 50);
          }),
      }),
    );
    const first = service.complete(1, request({ requestId: 1 }));
    const second = service.complete(1, request({ requestId: 2 }));
    expect(await first).toEqual({ text: '', error: null });
    expect(await second).toEqual({ text: 'late', error: null });
  });

  it('reports errors and timeouts as kinds', async () => {
    const limited = setUp(() => {
      throw httpError(429);
    });
    expect(await limited.service.complete(1, request())).toEqual({
      text: '',
      error: 'rateLimited',
    });
    const slow = setUp(
      () => 'x',
      enabled,
      (client) => ({
        ...client,
        complete: ({ signal }) =>
          new Promise((_resolve, reject) => {
            signal.addEventListener('abort', () => {
              reject(new DOMException('Aborted', 'AbortError'));
            });
          }),
      }),
    );
    expect(await slow.service.complete(1, request())).toEqual({ text: '', error: 'unreachable' });
  });
});

describe('cleanCompletion', () => {
  it('removes fences and the cursor marker', () => {
    expect(cleanCompletion('```ts\nfoo();\n```', '', '')).toBe('foo();');
    expect(cleanCompletion(`a${CURSOR}b`, '', '')).toBe('ab');
  });

  it('drops a repeated current line', () => {
    expect(cleanCompletion('const x = 42', 'let y;\nconst x = ', '')).toBe('42');
  });

  it('drops a tail that repeats the code after the cursor', () => {
    expect(cleanCompletion('  return a + b;\n}', 'function f() {\n', '\n}\n')).toBe(
      '  return a + b;',
    );
    // A closing brace that does not repeat the suffix stays.
    expect(cleanCompletion('if (a) {\n  b();\n}', '', '\n  c();\n}')).toBe('if (a) {\n  b();\n}');
  });

  it('turns whitespace into no suggestion', () => {
    expect(cleanCompletion('  \n ', '', '')).toBe('');
  });
});

describe('completionMessages', () => {
  it('shows the gap with a cursor marker', () => {
    const messages = completionMessages(request());
    expect(messages[1]?.content).toContain(`const x = ${CURSOR};`);
  });
});
