import { z } from 'zod';
import { relativePathSchema } from './workspace';

/** Ids are used in file names and permission targets: keep them simple. */
export const lspServerIdSchema = z
  .string()
  .min(1)
  .max(64)
  .regex(/^[a-z0-9][a-z0-9-]*$/);

/** File extension without the dot, lower case ("ts", "py"). */
const extensionSchema = z
  .string()
  .min(1)
  .max(20)
  .regex(/^[a-z0-9]+$/);

export const lspServerConfigSchema = z.object({
  id: lspServerIdSchema,
  name: z.string().min(1).max(100),
  command: z.string().min(1).max(1000),
  args: z.array(z.string().max(1000)).max(50),
  /** Files with these extensions are sent to this server. */
  extensions: z.array(extensionSchema).min(1).max(30),
  enabled: z.boolean(),
});
export type LspServerConfig = z.infer<typeof lspServerConfigSchema>;

export const lspServerViewSchema = lspServerConfigSchema.extend({
  /** Shipped template (can be edited and disabled, not deleted). */
  builtin: z.boolean(),
  /** The current command line was confirmed in the native dialog. */
  approved: z.boolean(),
});
export type LspServerView = z.infer<typeof lspServerViewSchema>;

export const lspServerStateSchema = z.enum([
  'starting',
  'ready',
  /** The program was not found (PATH or path). */
  'missing',
  /** The user declined to start it in the native dialog. */
  'declined',
  /** Crashed too often or failed to initialize. */
  'error',
]);
export type LspServerState = z.infer<typeof lspServerStateSchema>;

export const lspServerStatusSchema = z.object({
  serverId: lspServerIdSchema,
  name: z.string(),
  state: lspServerStateSchema,
});
export type LspServerStatus = z.infer<typeof lspServerStatusSchema>;

/** Zero-based like LSP; the renderer converts to Monaco's one-based positions. */
export const lspPositionSchema = z.object({
  line: z.number().int().min(0),
  character: z.number().int().min(0),
});
export type LspPosition = z.infer<typeof lspPositionSchema>;

export const lspRangeSchema = z.object({ start: lspPositionSchema, end: lspPositionSchema });
export type LspRange = z.infer<typeof lspRangeSchema>;

export const diagnosticSeveritySchema = z.enum(['error', 'warning', 'info', 'hint']);
export type DiagnosticSeverity = z.infer<typeof diagnosticSeveritySchema>;

export const diagnosticSchema = z.object({
  range: lspRangeSchema,
  severity: diagnosticSeveritySchema,
  message: z.string(),
  source: z.string().nullable(),
  code: z.string().nullable(),
});
export type Diagnostic = z.infer<typeof diagnosticSchema>;

export const fileDiagnosticsSchema = z.object({
  path: relativePathSchema,
  diagnostics: z.array(diagnosticSchema),
});
export type FileDiagnostics = z.infer<typeof fileDiagnosticsSchema>;

export const textEditSchema = z.object({ range: lspRangeSchema, text: z.string() });
export type TextEdit = z.infer<typeof textEditSchema>;

export const completionItemSchema = z.object({
  label: z.string(),
  /** LSP CompletionItemKind (1–25), mapped to Monaco's kinds in the renderer. */
  kind: z.number().int().nullable(),
  detail: z.string().nullable(),
  /** Markdown. */
  documentation: z.string().nullable(),
  insertText: z.string(),
  snippet: z.boolean(),
  /** Range the insert text replaces; null = the word at the cursor. */
  range: lspRangeSchema.nullable(),
  sortText: z.string().nullable(),
  filterText: z.string().nullable(),
  /** E.g. auto-imports at the top of the file. */
  additionalEdits: z.array(textEditSchema),
});
export type CompletionItem = z.infer<typeof completionItemSchema>;

export const completionListSchema = z.object({
  items: z.array(completionItemSchema),
  /** More items may come while typing (ask again instead of filtering). */
  incomplete: z.boolean(),
});
export type CompletionList = z.infer<typeof completionListSchema>;

export const hoverSchema = z.object({
  /** Markdown. */
  contents: z.string(),
  range: lspRangeSchema.nullable(),
});
export type Hover = z.infer<typeof hoverSchema>;

/** A definition inside the project (targets outside it are left out). */
export const locationSchema = z.object({ path: relativePathSchema, range: lspRangeSchema });
export type Location = z.infer<typeof locationSchema>;

export const signatureHelpSchema = z.object({
  signatures: z.array(
    z.object({
      label: z.string(),
      documentation: z.string().nullable(),
      parameters: z.array(
        z.object({
          /** A substring of the label, or [start, end) offsets into it. */
          label: z.union([z.string(), z.tuple([z.number(), z.number()])]),
          documentation: z.string().nullable(),
        }),
      ),
    }),
  ),
  activeSignature: z.number().int(),
  activeParameter: z.number().int(),
});
export type SignatureHelp = z.infer<typeof signatureHelpSchema>;

/** LSP language id for a file name (the server decides by extension). */
export function languageIdFor(path: string): string {
  const extension = path.slice(path.lastIndexOf('.') + 1).toLowerCase();
  return LANGUAGE_IDS[extension] ?? extension;
}

const LANGUAGE_IDS: Readonly<Record<string, string>> = {
  ts: 'typescript',
  mts: 'typescript',
  cts: 'typescript',
  tsx: 'typescriptreact',
  js: 'javascript',
  mjs: 'javascript',
  cjs: 'javascript',
  jsx: 'javascriptreact',
  py: 'python',
  pyi: 'python',
  rs: 'rust',
  go: 'go',
  c: 'c',
  h: 'c',
  cpp: 'cpp',
  cc: 'cpp',
  hpp: 'cpp',
  java: 'java',
  rb: 'ruby',
  php: 'php',
  cs: 'csharp',
};

/** Extension of a path in lower case, or "" without one. */
export function extensionOf(path: string): string {
  const name = path.slice(path.lastIndexOf('/') + 1);
  const dot = name.lastIndexOf('.');
  return dot <= 0 ? '' : name.slice(dot + 1).toLowerCase();
}
