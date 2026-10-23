import { z } from 'zod';

/** What Kestrel found out about the local Docker installation. */
export const dockerStateSchema = z.enum([
  'available',
  /** No Docker installation found. */
  'notInstalled',
  /** Installed, but the daemon (or Docker Desktop) is not running. */
  'notRunning',
  /** The daemon runs, but this user may not talk to it. */
  'noPermission',
  'error',
]);
export type DockerState = z.infer<typeof dockerStateSchema>;

export const sandboxStatusSchema = z.object({
  docker: dockerStateSchema,
  /** Docker engine version, when available. */
  version: z.string().nullable(),
  /** The sandbox image for the current base image is built. */
  imageReady: z.boolean(),
  /** An image build is running. */
  preparing: z.boolean(),
});
export type SandboxStatus = z.infer<typeof sandboxStatusSchema>;

/** Per-agent sandbox settings. */
export const agentSandboxSchema = z.object({
  /** Run the agent in a Docker container instead of directly on the system. */
  enabled: z.boolean(),
  memoryMb: z.number().int().min(512).max(262_144),
  cpus: z.number().min(0.5).max(128),
});
export type AgentSandbox = z.infer<typeof agentSandboxSchema>;

export const defaultAgentSandbox: AgentSandbox = { enabled: false, memoryMb: 4096, cpus: 2 };

/**
 * A Docker image reference like "node:22-bookworm-slim" or
 * "mirror.example.com/library/node:22". No spaces or shell characters.
 */
export const imageReferenceSchema = z
  .string()
  .min(1)
  .max(255)
  .regex(/^[a-z0-9][a-z0-9._\-/:@]*$/i);

export const DEFAULT_SANDBOX_BASE_IMAGE = 'node:22-bookworm-slim';
