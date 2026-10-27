import { z } from 'zod';
import {
  completionListSchema,
  fileDiagnosticsSchema,
  hoverSchema,
  locationSchema,
  lspPositionSchema,
  lspServerConfigSchema,
  lspServerIdSchema,
  lspServerStatusSchema,
  lspServerViewSchema,
  signatureHelpSchema,
} from '../../schemas/lsp';
import { relativePathSchema } from '../../schemas/workspace';

/** Text of an open document (the editor's model, not the file on disk). */
const documentText = z.object({
  path: relativePathSchema,
  text: z.string().max(20_000_000),
  version: z.number().int().min(0),
});

/** Lets the renderer cancel a request when Monaco no longer needs it. */
const requestId = z.string().max(64).optional();

const atPosition = z.object({ path: relativePathSchema, position: lspPositionSchema, requestId });

/**
 * Language servers. The renderer syncs the documents it has open and asks
 * narrow questions (completion, hover, definition, signature help); main
 * picks the server by file extension and speaks LSP with it. There is no
 * channel that forwards arbitrary LSP messages.
 */
export const lspChannels = {
  /** `served`: a server handles this file, so changes should be sent. */
  'lsp:open': { request: documentText, response: z.object({ served: z.boolean() }) },
  'lsp:change': { request: documentText, response: z.null() },
  'lsp:close': { request: z.object({ path: relativePathSchema }), response: z.null() },
  'lsp:completion': {
    request: atPosition.extend({ triggerCharacter: z.string().max(4).optional() }),
    response: completionListSchema,
  },
  'lsp:hover': { request: atPosition, response: hoverSchema.nullable() },
  'lsp:definition': { request: atPosition, response: z.array(locationSchema) },
  'lsp:signatureHelp': {
    request: atPosition.extend({ triggerCharacter: z.string().max(4).optional() }),
    response: signatureHelpSchema.nullable(),
  },
  'lsp:cancel': { request: z.object({ requestId: z.string().max(64) }), response: z.null() },
  /** Current diagnostics of this window (e.g. after a reload). */
  'lsp:diagnostics': { request: z.undefined(), response: z.array(fileDiagnosticsSchema) },
  'lsp:status': { request: z.undefined(), response: z.array(lspServerStatusSchema) },
  /** Stops this window's servers; they start again on the next open file. */
  'lsp:restart': { request: z.undefined(), response: z.null() },
  'lsp:listServers': { request: z.undefined(), response: z.array(lspServerViewSchema) },
  'lsp:saveServer': { request: lspServerConfigSchema, response: lspServerViewSchema },
  /** Built-in servers are reset to their template instead. */
  'lsp:deleteServer': { request: z.object({ id: lspServerIdSchema }), response: z.null() },
} as const;

export const lspEvents = {
  'lsp:diagnostics': fileDiagnosticsSchema,
  'lsp:status': z.array(lspServerStatusSchema),
  /** Server configurations changed. */
  'lsp:changed': z.object({}),
  /** A line of a server's diagnostic output (stderr), secrets redacted. */
  'lsp:log': z.object({ line: z.string(), time: z.number() }),
} as const;
