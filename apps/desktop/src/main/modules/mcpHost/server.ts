import { randomBytes, timingSafeEqual } from 'node:crypto';
import { createServer } from 'node:http';
import type { IncomingMessage, Server, ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import type { Transport } from '@modelcontextprotocol/sdk/shared/transport.js';
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import type { ToolDefinition } from './tools';

/** Creates the tools for one agent session (bound to its window and permissions). */
export type ToolFactory = () => ToolDefinition[] | Promise<ToolDefinition[]>;

interface Registration {
  token: Buffer;
  tools: ToolFactory;
}

export interface McpEndpoint {
  /** Bearer token; only this session's agent knows it. */
  token: string;
  /** URL on the host (127.0.0.1). */
  url: string;
  /** URL from inside a sandbox container, or null when not reachable. */
  containerUrl: string | null;
}

const MAX_BODY = 1_000_000;

function readBody(request: IncomingMessage): Promise<unknown> {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks: Buffer[] = [];
    request.on('data', (chunk: Buffer) => {
      size += chunk.length;
      if (size > MAX_BODY) {
        reject(new Error('Request too large.'));
        request.destroy();
        return;
      }
      chunks.push(chunk);
    });
    request.on('end', () => {
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString('utf8')));
      } catch (error) {
        reject(error instanceof Error ? error : new Error(String(error)));
      }
    });
    request.on('error', reject);
  });
}

function reply(response: ServerResponse, status: number, message: string): void {
  response.writeHead(status, { 'content-type': 'application/json' });
  response.end(JSON.stringify({ jsonrpc: '2.0', error: { code: -32000, message }, id: null }));
}

/** An MCP server for this session's tools, used for exactly one HTTP request. */
function mcpServerFor(tools: ToolDefinition[], version: string): McpServer {
  const mcp = new McpServer({ name: 'kestrel', version }, { capabilities: { tools: {} } });
  // Low-level handlers: proxied tools bring their own JSON Schema (no zod).
  const server = mcp.server;
  server.setRequestHandler(ListToolsRequestSchema, () => ({
    tools: tools.map((tool) => ({
      name: tool.name,
      description: tool.description,
      inputSchema: tool.inputSchema,
    })),
  }));
  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const tool = tools.find((entry) => entry.name === request.params.name);
    if (!tool) {
      return { content: [{ type: 'text', text: 'Unknown or disabled tool.' }], isError: true };
    }
    return tool.run(request.params.arguments ?? {});
  });
  return mcp;
}

/**
 * Kestrel's own MCP server for agents ("kestrel"), over streamable HTTP in
 * stateless JSON mode. Every request needs the bearer token of a running
 * agent session; the token decides which window's tools are used.
 */
export class McpHost {
  private readonly registrations = new Map<string, Registration>();
  private readonly servers = new Map<string, { server: Server; port: number }>();
  private nextId = 1;

  constructor(
    private readonly version: string,
    /** Host address of the Docker bridge (Linux), so containers can connect. */
    private readonly containerHost: () => Promise<{ listen: string; url: string } | null>,
  ) {}

  private async listen(address: string): Promise<number> {
    const existing = this.servers.get(address);
    if (existing) return existing.port;
    const server = createServer((request, response) => {
      void this.handle(request, response);
    });
    await new Promise<void>((resolve, reject) => {
      server.once('error', reject);
      server.listen(0, address, () => {
        server.off('error', reject);
        resolve();
      });
    });
    const { port } = server.address() as AddressInfo;
    this.servers.set(address, { server, port });
    return port;
  }

  private find(header: string | undefined): Registration | null {
    const match = /^Bearer ([0-9a-f]{64})$/.exec(header ?? '');
    if (!match?.[1]) return null;
    const token = Buffer.from(match[1], 'hex');
    for (const registration of this.registrations.values()) {
      if (timingSafeEqual(registration.token, token)) return registration;
    }
    return null;
  }

  private async handle(request: IncomingMessage, response: ServerResponse): Promise<void> {
    if (request.url !== '/mcp') {
      reply(response, 404, 'Not found.');
      return;
    }
    const registration = this.find(request.headers.authorization);
    if (!registration) {
      reply(response, 401, 'Unauthorized.');
      return;
    }
    // Stateless JSON mode: no server-sent event stream to open.
    if (request.method !== 'POST') {
      reply(response, 405, 'Method not allowed.');
      return;
    }
    let body: unknown;
    try {
      body = await readBody(request);
    } catch {
      reply(response, 400, 'Invalid request body.');
      return;
    }
    let tools: ToolDefinition[];
    try {
      tools = await registration.tools();
    } catch {
      reply(response, 500, 'Tools unavailable.');
      return;
    }
    const server = mcpServerFor(tools, this.version);
    // No session id generator: stateless mode, one server per request.
    const transport = new StreamableHTTPServerTransport({ enableJsonResponse: true });
    response.on('close', () => {
      void transport.close();
      void server.close();
    });
    try {
      // The SDK's own transport does not satisfy its Transport type under
      // exactOptionalPropertyTypes (optional members without `| undefined`).
      await server.connect(transport as unknown as Transport);
      await transport.handleRequest(request, response, body);
    } catch {
      if (!response.headersSent) reply(response, 500, 'Internal error.');
    }
  }

  /** Registers an agent session; `revoke` with the returned id when it ends. */
  async register(tools: ToolFactory, forContainer: boolean): Promise<{ id: string } & McpEndpoint> {
    const token = randomBytes(32);
    const id = `m${String(this.nextId++)}`;
    this.registrations.set(id, { token, tools });
    const port = await this.listen('127.0.0.1');
    let containerUrl: string | null = null;
    if (forContainer) {
      const host = await this.containerHost();
      if (host) {
        const containerPort = host.listen === '127.0.0.1' ? port : await this.listen(host.listen);
        containerUrl = `http://${host.url}:${String(containerPort)}/mcp`;
      }
    }
    return {
      id,
      token: token.toString('hex'),
      url: `http://127.0.0.1:${String(port)}/mcp`,
      containerUrl,
    };
  }

  revoke(id: string): void {
    this.registrations.delete(id);
  }

  async close(): Promise<void> {
    this.registrations.clear();
    await Promise.all(
      [...this.servers.values()].map(
        ({ server }) =>
          new Promise((resolve) => {
            server.close(resolve);
          }),
      ),
    );
    this.servers.clear();
  }
}
