import { z } from 'zod';
import { sandboxStatusSchema } from '../../schemas/sandbox';

export const sandboxChannels = {
  /** Checks Docker and whether the sandbox image is built. */
  'sandbox:status': { request: z.undefined(), response: sandboxStatusSchema },
  /** Builds the sandbox image (progress arrives as `sandbox:log`). */
  'sandbox:prepare': { request: z.undefined(), response: sandboxStatusSchema },
  /**
   * Opens a terminal in a sandbox container of this agent, without the
   * project, so the user can log in to the agent there. The login stays in
   * the agent's Docker volume; Kestrel never reads it.
   */
  'sandbox:loginTerminal': {
    request: z.object({
      agentId: z.string(),
      cols: z.number().int().min(2).max(1000),
      rows: z.number().int().min(1).max(1000),
    }),
    response: z.object({ id: z.string().regex(/^t\d+$/), shell: z.string(), cwd: z.string() }),
  },
} as const;

export const sandboxEvents = {
  'sandbox:status': sandboxStatusSchema,
  /** A line of the image build output. */
  'sandbox:log': z.object({ line: z.string(), time: z.number() }),
} as const;
