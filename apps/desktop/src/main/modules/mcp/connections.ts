import { createInterface } from 'node:readline';
import type { Readable } from 'node:stream';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { findProgram } from '../../lib/which';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import type { Transport } from '@modelcontextprotocol/sdk/shared/transport.js';
import type { McpTransport } from '@kestrel/shared';

const CONNECT_TIMEOUT_MS = 30_000;
const CALL_TIMEOUT_MS = 120_000;

/** A tool as the server describes it (description and schema are untrusted). */
export interface RemoteTool {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
}

export type RemoteContent =
  | { type: 'text'; text: string }
  | { type: 'image'; data: string; mimeType: string }
  | { type: 'other'; kind: string; text: string | null };

export interface RemoteResult {
  content: RemoteContent[];
  isError: boolean;
}

/** An open connection to one MCP server. */
export interface McpConnection {
  tools(): Promise<RemoteTool[]>;
  call(name: string, args: Record<string, unknown>): Promise<RemoteResult>;
  close(): Promise<void>;
  /** Called once when the connection ends (server exited, network error). */
  onClose(listener: () => void): void;
}

export interface ConnectTarget {
  transport: McpTransport;
  /** Secret values: env variables (stdio) or headers (http) by name. */
  secrets: Readonly<Record<string, string>>;
  /** Working folder of a local server. */
  cwd: string;
  /** Base environment of a local server (without Kestrel internals). */
  env: Readonly<Record<string, string>>;
}

export type ConnectMcp = (
  target: ConnectTarget,
  onLog: (line: string) => void,
) => Promise<McpConnection>;

/** Why a connection failed, in words the user can act on. */
export class McpConnectError extends Error {}

function describeError(error: unknown, transport: McpTransport): string {
  const text = error instanceof Error ? error.message : String(error);
  const code = (error as { code?: unknown } | null)?.code;
  if (code === 'ENOENT' || /spawn .* ENOENT/.test(text)) return 'The program was not found.';
  if (code === 'EACCES') return 'The program may not be started (no permission).';
  // The SDK's HTTP errors carry the status as `code`.
  if (code === 401 || code === 403 || /\b401\b|\b403\b|unauthori[sz]ed|forbidden/i.test(text)) {
    return 'The server refused access. Check the headers (e.g. Authorization).';
  }
  if (/timed? ?out/i.test(text)) return 'The server did not answer in time.';
  if (transport.type === 'http' && /fetch failed|ECONNREFUSED|ENOTFOUND/i.test(text)) {
    return 'The server could not be reached.';
  }
  return 'The connection failed. Details are in Logs › MCP.';
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  return Promise.race([
    promise,
    new Promise<never>((_resolve, reject) => {
      timer = setTimeout(() => {
        reject(new Error('Timed out.'));
      }, ms);
    }),
  ]).finally(() => {
    clearTimeout(timer);
  });
}

function toRemoteContent(item: Record<string, unknown>): RemoteContent {
  if (item['type'] === 'text' && typeof item['text'] === 'string') {
    return { type: 'text', text: item['text'] };
  }
  if (
    item['type'] === 'image' &&
    typeof item['data'] === 'string' &&
    typeof item['mimeType'] === 'string'
  ) {
    return { type: 'image', data: item['data'], mimeType: item['mimeType'] };
  }
  const resource = item['resource'] as Record<string, unknown> | undefined;
  const text = typeof resource?.['text'] === 'string' ? resource['text'] : null;
  return { type: 'other', kind: String(item['type']), text };
}

/** Connects with the official MCP SDK (stdio process or streamable HTTP). */
export const connectMcp: ConnectMcp = async (target, onLog) => {
  const { transport } = target;
  let clientTransport: StdioClientTransport | StreamableHTTPClientTransport;
  if (transport.type === 'stdio') {
    // Checked first: on Windows the SDK starts programs through a shell, so a
    // missing program would only show up as "connection closed".
    const program = await findProgram(transport.command, {
      platform: process.platform,
      env: target.env,
      cwd: target.cwd,
    });
    if (!program) {
      onLog(`Program not found: ${transport.command}`);
      throw new McpConnectError('The program was not found.');
    }
    const env: Record<string, string> = { ...target.env };
    for (const name of transport.env) {
      const value = target.secrets[name];
      if (value !== undefined) env[name] = value;
    }
    const stdio = new StdioClientTransport({
      command: transport.command,
      args: transport.args,
      env,
      cwd: target.cwd,
      stderr: 'pipe',
    });
    clientTransport = stdio;
  } else {
    const headers: Record<string, string> = {};
    for (const name of transport.headers) {
      const value = target.secrets[name];
      if (value !== undefined) headers[name] = value;
    }
    clientTransport = new StreamableHTTPClientTransport(new URL(transport.url), {
      requestInit: { headers },
    });
  }

  const client = new Client({ name: 'kestrel', version: '1' });
  const closeListeners: (() => void)[] = [];
  let closed = false;
  client.onclose = () => {
    if (closed) return;
    closed = true;
    for (const listener of closeListeners) listener();
  };
  try {
    // The SDK's transports do not satisfy its Transport type under
    // exactOptionalPropertyTypes (optional members without `| undefined`).
    const connecting = client.connect(clientTransport as unknown as Transport);
    if (clientTransport instanceof StdioClientTransport) {
      const stderr = clientTransport.stderr as Readable | null;
      if (stderr) createInterface({ input: stderr }).on('line', onLog);
    }
    await withTimeout(connecting, CONNECT_TIMEOUT_MS);
  } catch (error) {
    onLog(`Connection failed: ${error instanceof Error ? error.message : String(error)}`);
    await client.close().catch(() => undefined);
    throw new McpConnectError(describeError(error, transport));
  }

  return {
    tools: async () => {
      const tools: RemoteTool[] = [];
      let cursor: string | undefined;
      do {
        const page = await withTimeout(
          client.listTools(cursor === undefined ? {} : { cursor }),
          CONNECT_TIMEOUT_MS,
        );
        for (const tool of page.tools) {
          tools.push({
            name: tool.name,
            description: tool.description ?? '',
            inputSchema: tool.inputSchema,
          });
        }
        cursor = page.nextCursor;
      } while (cursor && tools.length < 500);
      return tools;
    },
    call: async (name, args) => {
      const result = await withTimeout(client.callTool({ name, arguments: args }), CALL_TIMEOUT_MS);
      const content = Array.isArray(result.content) ? (result.content as unknown[]) : [];
      return {
        content: content
          .filter(
            (item): item is Record<string, unknown> => typeof item === 'object' && item !== null,
          )
          .map(toRemoteContent),
        isError: result.isError === true,
      };
    },
    close: async () => {
      await client.close().catch(() => undefined);
    },
    onClose: (listener) => {
      closeListeners.push(listener);
    },
  };
};
