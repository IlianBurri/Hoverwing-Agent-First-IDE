import { createServer } from 'node:http';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';

/**
 * A scripted Ollama API for the setup assistant: version, model list,
 * a streamed pull (two progress lines) and a benchmark answer of 50 tokens/s.
 */
export async function startFakeOllama(): Promise<{ url: string; close: () => Promise<void> }> {
  const models: string[] = [];
  const server: Server = createServer((request, response) => {
    let body = '';
    request.on('data', (chunk: Buffer) => {
      body += chunk.toString();
    });
    request.on('end', () => {
      const path = new URL(request.url ?? '/', 'http://localhost').pathname;
      const json = (data: unknown) => {
        response.writeHead(200, { 'content-type': 'application/json' });
        response.end(JSON.stringify(data));
      };
      if (path === '/api/version') {
        json({ version: '9.9.9' });
      } else if (path === '/api/tags') {
        json({ models: models.map((name) => ({ name })) });
      } else if (path === '/api/generate') {
        json({ eval_count: 100, eval_duration: 2_000_000_000 });
      } else if (path === '/api/pull') {
        const { model } = JSON.parse(body || '{}') as { model?: string };
        response.writeHead(200, { 'content-type': 'application/x-ndjson' });
        response.write(`${JSON.stringify({ status: 'pulling manifest' })}\n`);
        response.write(
          `${JSON.stringify({ status: 'pulling', digest: 'a', total: 1000, completed: 400 })}\n`,
        );
        setTimeout(() => {
          response.write(
            `${JSON.stringify({ status: 'pulling', digest: 'a', total: 1000, completed: 1000 })}\n`,
          );
          response.end(`${JSON.stringify({ status: 'success' })}\n`);
          if (model) models.push(model);
        }, 300);
      } else {
        response.writeHead(404);
        response.end();
      }
    });
  });
  await new Promise<void>((resolve) => {
    server.listen(0, '127.0.0.1', resolve);
  });
  const { port } = server.address() as AddressInfo;
  return {
    url: `http://127.0.0.1:${String(port)}`,
    close: () =>
      new Promise((resolve) => {
        server.closeAllConnections();
        server.close(() => {
          resolve();
        });
      }),
  };
}
