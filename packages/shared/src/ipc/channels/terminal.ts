import { z } from 'zod';

const terminalId = z.string().regex(/^t\d+$/);
const size = { cols: z.number().int().min(2).max(1000), rows: z.number().int().min(1).max(1000) };

/**
 * Interactive terminals the user opens. `terminal:write` only feeds keyboard
 * input into a shell this window created; it is not a "run command" API.
 * Agents will never use these channels (they go through permissions).
 */
export const terminalChannels = {
  'terminal:create': {
    request: z.object(size),
    response: z.object({ id: terminalId, shell: z.string(), cwd: z.string() }),
  },
  'terminal:write': {
    request: z.object({ id: terminalId, data: z.string().max(1_000_000) }),
    response: z.null(),
  },
  'terminal:resize': { request: z.object({ id: terminalId, ...size }), response: z.null() },
  'terminal:kill': { request: z.object({ id: terminalId }), response: z.null() },
} as const;

export const terminalEvents = {
  'terminal:data': z.object({ id: terminalId, data: z.string() }),
  'terminal:exit': z.object({ id: terminalId, exitCode: z.number().int() }),
} as const;
