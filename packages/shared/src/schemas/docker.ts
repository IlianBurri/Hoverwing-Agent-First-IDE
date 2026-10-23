import { z } from 'zod';
import { dockerStateSchema } from './sandbox';

export const containerIdSchema = z.string().regex(/^[0-9a-f]{12,64}$/);
export const imageIdSchema = z.string().regex(/^sha256:[0-9a-f]{64}$/);

/** Image tag the user may build, e.g. "my-app:latest" or "registry/app:1". */
export const imageTagSchema = z
  .string()
  .min(1)
  .max(200)
  .regex(/^[a-z0-9][a-z0-9._\-/]*(:[A-Za-z0-9_][A-Za-z0-9._-]{0,127})?$/);

export const containerStateSchema = z.enum([
  'running',
  'paused',
  'restarting',
  'created',
  'exited',
  'removing',
  'dead',
  'unknown',
]);
export type ContainerState = z.infer<typeof containerStateSchema>;

export const portMappingSchema = z.object({
  privatePort: z.number().int(),
  publicPort: z.number().int().nullable(),
  protocol: z.string(),
  /** Host address the port is bound to (null = not published). */
  ip: z.string().nullable(),
});
export type PortMapping = z.infer<typeof portMappingSchema>;

export const containerSummarySchema = z.object({
  id: containerIdSchema,
  name: z.string(),
  image: z.string(),
  state: containerStateSchema,
  /** Human text from Docker, e.g. "Up 5 minutes" (not translated). */
  status: z.string(),
  created: z.number(),
  ports: z.array(portMappingSchema),
  /** A container of Kestrel's agent sandbox. */
  sandbox: z.boolean(),
  /** Docker Compose project name, if any. */
  composeProject: z.string().nullable(),
  /** Belongs to the open project (compose folder or bind mount inside it). */
  inProject: z.boolean(),
});
export type ContainerSummary = z.infer<typeof containerSummarySchema>;

export const imageSummarySchema = z.object({
  id: imageIdSchema,
  tags: z.array(z.string()),
  size: z.number(),
  created: z.number(),
  containers: z.number().int(),
});
export type ImageSummary = z.infer<typeof imageSummarySchema>;

export const dockerOverviewSchema = z.object({
  docker: dockerStateSchema,
  containers: z.array(containerSummarySchema),
  images: z.array(imageSummarySchema),
});
export type DockerOverview = z.infer<typeof dockerOverviewSchema>;
