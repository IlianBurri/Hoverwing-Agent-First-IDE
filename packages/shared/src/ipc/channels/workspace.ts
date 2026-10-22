import { z } from 'zod';
import {
  dirEntrySchema,
  entryNameSchema,
  fileContentSchema,
  relativePathSchema,
  workspaceChangesSchema,
  workspaceInfoSchema,
  writeResultSchema,
} from '../../schemas/workspace';

const pathRequest = z.object({ path: relativePathSchema });

export const workspaceChannels = {
  /** Shows the native folder picker; null when the user cancels. */
  'workspace:openDialog': { request: z.undefined(), response: workspaceInfoSchema.nullable() },
  /** Only paths from the recent list are accepted (no silent access elsewhere). */
  'workspace:openRecent': {
    request: z.object({ root: z.string().max(4096) }),
    response: workspaceInfoSchema,
  },
  'workspace:close': { request: z.undefined(), response: z.null() },
  'workspace:get': { request: z.undefined(), response: workspaceInfoSchema.nullable() },
  'workspace:readDir': { request: pathRequest, response: z.array(dirEntrySchema) },
  'workspace:readFile': { request: pathRequest, response: fileContentSchema },
  'workspace:writeFile': {
    request: z.object({
      path: relativePathSchema,
      content: z.string(),
      /** Last known modification time; a mismatch returns a conflict. */
      expectedMtimeMs: z.number().optional(),
    }),
    response: writeResultSchema,
  },
  'workspace:createFile': {
    request: z.object({ dir: relativePathSchema, name: entryNameSchema }),
    response: relativePathSchema,
  },
  'workspace:createDirectory': {
    request: z.object({ dir: relativePathSchema, name: entryNameSchema }),
    response: relativePathSchema,
  },
  /** Rename and move: `to` is the new relative path. */
  'workspace:rename': {
    request: z.object({ from: relativePathSchema, to: relativePathSchema }),
    response: relativePathSchema,
  },
  /** Moves to the system trash (recoverable). The UI confirms before calling. */
  'workspace:trash': { request: pathRequest, response: z.null() },
} as const;

export const workspaceEvents = {
  'workspace:changed': workspaceChangesSchema,
} as const;
