import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { McpTransport } from '@kestrel/shared';
import { mcpServerIdSchema } from '@kestrel/shared';

/** A server from a project's .mcp.json, with its secret values. */
export interface ImportedServer {
  id: string;
  name: string;
  transport: McpTransport;
  /** Env variable or header values (stored in the secret store on import). */
  secrets: Record<string, string>;
}

type Json = Record<string, unknown>;
const isObject = (value: unknown): value is Json =>
  typeof value === 'object' && value !== null && !Array.isArray(value);
const strings = (value: unknown): string[] =>
  Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [];
const stringMap = (value: unknown): Record<string, string> =>
  isObject(value)
    ? Object.fromEntries(
        Object.entries(value).filter(
          (entry): entry is [string, string] => typeof entry[1] === 'string',
        ),
      )
    : {};

/** "My Server!" -> "my-server" (a valid server id), or null. */
export function serverIdFrom(name: string): string | null {
  const id = name
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40);
  return mcpServerIdSchema.safeParse(id).success ? id : null;
}

const VARIABLE = /^[A-Za-z_][A-Za-z0-9_-]*$/;

/**
 * Parses the common `.mcp.json` format (`{ "mcpServers": { name: … } }`).
 * Unknown or invalid entries are skipped; nothing is executed.
 */
export function parseMcpJson(text: string): ImportedServer[] {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    return [];
  }
  const servers = isObject(data) && isObject(data['mcpServers']) ? data['mcpServers'] : {};
  const result: ImportedServer[] = [];
  for (const [name, entry] of Object.entries(servers)) {
    const id = serverIdFrom(name);
    if (!id || !isObject(entry) || result.some((server) => server.id === id)) continue;
    const type = typeof entry['type'] === 'string' ? entry['type'] : null;
    const url = typeof entry['url'] === 'string' ? entry['url'] : null;
    if (url && (type === null || type === 'http' || type === 'streamable-http')) {
      if (!/^https?:\/\/\S+$/.test(url)) continue;
      const headers = Object.fromEntries(
        Object.entries(stringMap(entry['headers'])).filter(([key]) => VARIABLE.test(key)),
      );
      result.push({
        id,
        name,
        transport: { type: 'http', url, headers: Object.keys(headers) },
        secrets: headers,
      });
    } else if (typeof entry['command'] === 'string' && entry['command'] && type !== 'sse') {
      const env = Object.fromEntries(
        Object.entries(stringMap(entry['env'])).filter(([key]) => VARIABLE.test(key)),
      );
      result.push({
        id,
        name,
        transport: {
          type: 'stdio',
          command: entry['command'],
          args: strings(entry['args']),
          env: Object.keys(env),
        },
        secrets: env,
      });
    }
  }
  return result.slice(0, 100);
}

export async function readProjectMcpJson(root: string): Promise<ImportedServer[]> {
  try {
    return parseMcpJson(await readFile(join(root, '.mcp.json'), 'utf8'));
  } catch {
    return [];
  }
}
