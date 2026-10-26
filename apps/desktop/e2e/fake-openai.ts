import { createServer } from 'node:http';
import type { IncomingMessage, Server, ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';

export interface FakeRequest {
  path: string;
  authorization: string | undefined;
  body: Record<string, unknown>;
}

interface ChatBody {
  model?: string;
  stream?: boolean;
  messages?: { role: string; content: string }[];
}

const MODELS = ['busy-model', 'fast-model', 'coder'];

function readBody(request: IncomingMessage): Promise<Record<string, unknown>> {
  return new Promise((resolve) => {
    let data = '';
    request.on('data', (chunk: Buffer) => {
      data += chunk.toString();
    });
    request.on('end', () => {
      try {
        resolve(JSON.parse(data || '{}') as Record<string, unknown>);
      } catch {
        resolve({});
      }
    });
  });
}

function json(response: ServerResponse, status: number, body: unknown, headers = {}): void {
  response.writeHead(status, { 'content-type': 'application/json', ...headers });
  response.end(JSON.stringify(body));
}

const sleep = (ms: number) =>
  new Promise((resolve) => {
    setTimeout(resolve, ms);
  });

/**
 * A scripted OpenAI-compatible endpoint for E2E tests:
 * - "busy-model" always answers 429 (rate limit) → fallback,
 * - chat streams "Echo: <first line of the last message>" word by word,
 *   or a long, slow answer for "slow",
 * - /completions (fill-in-the-middle) answers "42" for "coder".
 */
export async function startFakeOpenAi(): Promise<{
  url: string;
  requests: FakeRequest[];
  close: () => Promise<void>;
}> {
  const requests: FakeRequest[] = [];
  const server: Server = createServer((request, response) => {
    void (async () => {
      const path = new URL(request.url ?? '/', 'http://localhost').pathname;
      const body = await readBody(request);
      requests.push({ path, authorization: request.headers.authorization, body });
      const { model, stream, messages } = body as ChatBody;

      if (path === '/v1/models') {
        json(response, 200, {
          object: 'list',
          data: MODELS.map((id) => ({ id, object: 'model', created: 0, owned_by: 'test' })),
        });
        return;
      }
      if (model === 'busy-model') {
        json(response, 429, { error: { message: 'Rate limit' } }, { 'retry-after': '2' });
        return;
      }
      if (path === '/v1/completions') {
        json(response, 200, {
          id: 'cmpl',
          object: 'text_completion',
          created: 0,
          model,
          choices: [{ index: 0, text: '42', finish_reason: 'stop', logprobs: null }],
        });
        return;
      }
      if (path !== '/v1/chat/completions') {
        json(response, 404, { error: { message: 'Not found' } });
        return;
      }
      const last = messages?.at(-1)?.content ?? '';
      const question = last.split('\n')[0] ?? '';
      if (!stream) {
        json(response, 200, {
          id: 'chat',
          object: 'chat.completion',
          created: 0,
          model,
          choices: [
            {
              index: 0,
              message: { role: 'assistant', content: '42' },
              finish_reason: 'stop',
              logprobs: null,
            },
          ],
        });
        return;
      }
      const slow = question === 'slow';
      const words = slow
        ? Array.from({ length: 200 }, (_, index) => `word${String(index)} `)
        : `Echo: ${question}`.split(/(?<= )/);
      response.writeHead(200, { 'content-type': 'text/event-stream' });
      for (const word of words) {
        if (response.destroyed) return;
        const chunk = {
          id: 'chat',
          object: 'chat.completion.chunk',
          created: 0,
          model,
          choices: [{ index: 0, delta: { content: word }, finish_reason: null }],
        };
        response.write(`data: ${JSON.stringify(chunk)}\n\n`);
        await sleep(slow ? 200 : 20);
      }
      response.end('data: [DONE]\n\n');
    })();
  });
  await new Promise<void>((resolve) => {
    server.listen(0, '127.0.0.1', resolve);
  });
  const { port } = server.address() as AddressInfo;
  return {
    url: `http://127.0.0.1:${String(port)}/v1`,
    requests,
    close: () =>
      new Promise((resolve) => {
        server.closeAllConnections();
        server.close(() => {
          resolve();
        });
      }),
  };
}
