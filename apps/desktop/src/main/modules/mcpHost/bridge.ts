import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

/**
 * A dependency-free Node script for agents that only start MCP servers as
 * processes (stdio): it relays newline-delimited JSON-RPC to Hoverwing's HTTP
 * endpoint. URL and token come from the environment the agent passes on.
 */
export const BRIDGE_SCRIPT = `// Hoverwing MCP bridge: stdio <-> Hoverwing's local MCP endpoint.
import { createInterface } from 'node:readline';

const url = process.env.KESTREL_MCP_URL;
const token = process.env.KESTREL_MCP_TOKEN;
const write = (message) => process.stdout.write(JSON.stringify(message) + '\\n');

createInterface({ input: process.stdin })
  .on('line', async (line) => {
    if (!line.trim()) return;
    let message;
    try {
      message = JSON.parse(line);
    } catch {
      return;
    }
    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          authorization: 'Bearer ' + token,
          'content-type': 'application/json',
          accept: 'application/json, text/event-stream',
        },
        body: line,
      });
      const text = await response.text();
      if (!text.trim()) return;
      const data = JSON.parse(text);
      for (const item of Array.isArray(data) ? data : [data]) write(item);
    } catch {
      if (message && message.id !== undefined) {
        write({
          jsonrpc: '2.0',
          id: message.id,
          error: { code: -32603, message: 'Hoverwing is not reachable.' },
        });
      }
    }
  })
  .on('close', () => process.exit(0));
`;

export const BRIDGE_FILE = 'kestrel-mcp-bridge.mjs';

/** Writes the bridge into `dir` and returns its path. */
export async function writeBridge(dir: string): Promise<string> {
  await mkdir(dir, { recursive: true });
  const path = join(dir, BRIDGE_FILE);
  await writeFile(path, BRIDGE_SCRIPT, { encoding: 'utf8', mode: 0o644 });
  return path;
}
