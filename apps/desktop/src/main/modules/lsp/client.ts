import { CancellationTokenSource, createMessageConnection } from 'vscode-jsonrpc/node';
import type { CancellationToken, MessageConnection } from 'vscode-jsonrpc/node';
import type * as Lsp from 'vscode-languageserver-protocol';
import { pathToFileURL } from 'node:url';
import { basename } from 'node:path';
import type { LspTransport } from './transport';

/** Starting can include an npx download, so be patient. */
const INITIALIZE_TIMEOUT_MS = 120_000;
/** Interactive requests (completion, hover …) that take longer are dropped. */
export const REQUEST_TIMEOUT_MS = 10_000;
const SHUTDOWN_TIMEOUT_MS = 2000;

export interface LspClientEvents {
  diagnostics(params: Lsp.PublishDiagnosticsParams): void;
  log(line: string): void;
  /** The connection ended (process exit or stream closed). */
  closed(): void;
}

function withTimeout<T>(promise: Promise<T>, ms: number, what: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(`${what} timed out`));
    }, ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error: unknown) => {
        clearTimeout(timer);
        reject(error instanceof Error ? error : new Error(String(error)));
      },
    );
  });
}

/** What Hoverwing can do with a server's answers. */
export const CLIENT_CAPABILITIES: Lsp.ClientCapabilities = {
  general: { positionEncodings: ['utf-16'] },
  workspace: {
    workspaceFolders: true,
    configuration: true,
    didChangeWatchedFiles: { dynamicRegistration: false },
  },
  textDocument: {
    synchronization: { didSave: false, willSave: false, dynamicRegistration: false },
    completion: {
      contextSupport: true,
      completionItem: {
        snippetSupport: true,
        documentationFormat: ['markdown', 'plaintext'],
        labelDetailsSupport: true,
        insertReplaceSupport: true,
      },
      completionList: { itemDefaults: ['editRange', 'insertTextFormat'] },
    },
    hover: { contentFormat: ['markdown', 'plaintext'] },
    definition: { linkSupport: true },
    signatureHelp: {
      contextSupport: true,
      signatureInformation: {
        documentationFormat: ['markdown', 'plaintext'],
        parameterInformation: { labelOffsetSupport: true },
        activeParameterSupport: true,
      },
    },
    publishDiagnostics: { relatedInformation: false },
  },
  window: { workDoneProgress: false },
};

/**
 * One connection to one language server process. Hoverwing only reads from
 * servers: requests to change files (`workspace/applyEdit`) or show
 * documents are refused.
 */
export class LspClient {
  private readonly connection: MessageConnection;
  private capabilities: Lsp.ServerCapabilities = {};
  private closed = false;

  constructor(
    private readonly transport: LspTransport,
    private readonly root: string,
    private readonly events: LspClientEvents,
  ) {
    this.connection = createMessageConnection(transport.input, transport.output);
    const folders = (): Lsp.WorkspaceFolder[] => [
      { uri: pathToFileURL(root).href, name: basename(root) || root },
    ];
    this.connection.onRequest('workspace/configuration', (params: Lsp.ConfigurationParams) =>
      params.items.map(() => null),
    );
    this.connection.onRequest('workspace/workspaceFolders', folders);
    this.connection.onRequest('client/registerCapability', () => null);
    this.connection.onRequest('client/unregisterCapability', () => null);
    this.connection.onRequest('window/workDoneProgress/create', () => null);
    this.connection.onRequest('window/showMessageRequest', () => null);
    this.connection.onRequest('window/showDocument', () => ({ success: false }));
    this.connection.onRequest('workspace/applyEdit', () => ({
      applied: false,
      failureReason: 'Hoverwing does not apply edits from language servers.',
    }));
    this.connection.onNotification(
      'textDocument/publishDiagnostics',
      (params: Lsp.PublishDiagnosticsParams) => {
        events.diagnostics(params);
      },
    );
    const logMessage = (params: Lsp.LogMessageParams) => {
      events.log(params.message);
    };
    this.connection.onNotification('window/logMessage', logMessage);
    this.connection.onNotification('window/showMessage', logMessage);
    this.connection.onClose(() => {
      this.markClosed();
    });
    this.connection.onError(([error]) => {
      events.log(`connection error: ${error.message}`);
    });
    transport.onStderr((line) => {
      events.log(line);
    });
    transport.onExit(() => {
      this.markClosed();
    });
    this.connection.listen();
  }

  private markClosed(): void {
    if (this.closed) return;
    this.closed = true;
    this.events.closed();
  }

  get isClosed(): boolean {
    return this.closed;
  }

  get triggerCharacters(): { completion: string[]; signature: string[] } {
    return {
      completion: this.capabilities.completionProvider?.triggerCharacters ?? [],
      signature: this.capabilities.signatureHelpProvider?.triggerCharacters ?? [],
    };
  }

  /** The LSP handshake; must finish before any document is sent. */
  async initialize(): Promise<void> {
    const rootUri = pathToFileURL(this.root).href;
    const result = await withTimeout(
      this.connection.sendRequest<Lsp.InitializeResult>('initialize', {
        processId: process.pid,
        clientInfo: { name: 'Hoverwing' },
        // Deprecated in favour of workspaceFolders, but older servers still need it.
        // eslint-disable-next-line @typescript-eslint/no-deprecated
        rootUri,
        workspaceFolders: [{ uri: rootUri, name: basename(this.root) || this.root }],
        capabilities: CLIENT_CAPABILITIES,
      } satisfies Lsp.InitializeParams),
      INITIALIZE_TIMEOUT_MS,
      'initialize',
    );
    this.capabilities = result.capabilities;
    await this.connection.sendNotification('initialized', {});
  }

  private get syncKind(): number {
    const sync = this.capabilities.textDocumentSync;
    if (sync === undefined) return 0;
    return typeof sync === 'number' ? sync : (sync.change ?? 0);
  }

  supports(feature: 'completion' | 'hover' | 'definition' | 'signatureHelp'): boolean {
    switch (feature) {
      case 'completion':
        return this.capabilities.completionProvider !== undefined;
      case 'hover':
        return Boolean(this.capabilities.hoverProvider);
      case 'definition':
        return Boolean(this.capabilities.definitionProvider);
      case 'signatureHelp':
        return this.capabilities.signatureHelpProvider !== undefined;
    }
  }

  async open(uri: string, languageId: string, version: number, text: string): Promise<void> {
    if (this.closed) return;
    await this.connection.sendNotification('textDocument/didOpen', {
      textDocument: { uri, languageId, version, text },
    } satisfies Lsp.DidOpenTextDocumentParams);
  }

  /** Sends the whole text (valid for both full and incremental servers). */
  async change(uri: string, version: number, text: string): Promise<void> {
    if (this.closed || this.syncKind === 0) return;
    await this.connection.sendNotification('textDocument/didChange', {
      textDocument: { uri, version },
      contentChanges: [{ text }],
    } satisfies Lsp.DidChangeTextDocumentParams);
  }

  async close(uri: string): Promise<void> {
    if (this.closed) return;
    await this.connection.sendNotification('textDocument/didClose', {
      textDocument: { uri },
    } satisfies Lsp.DidCloseTextDocumentParams);
  }

  async watchedFilesChanged(changes: Lsp.FileEvent[]): Promise<void> {
    if (this.closed || changes.length === 0) return;
    await this.connection.sendNotification('workspace/didChangeWatchedFiles', {
      changes,
    } satisfies Lsp.DidChangeWatchedFilesParams);
  }

  /** A request with timeout; cancelling the token sends `$/cancelRequest`. */
  request<R>(method: string, params: unknown, token?: CancellationToken): Promise<R> {
    if (this.closed) return Promise.reject(new Error('Language server is not running.'));
    const source = new CancellationTokenSource();
    const subscription = token?.onCancellationRequested(() => {
      source.cancel();
    });
    const timer = setTimeout(() => {
      source.cancel();
    }, REQUEST_TIMEOUT_MS);
    return this.connection.sendRequest<R>(method, params, source.token).finally(() => {
      clearTimeout(timer);
      subscription?.dispose();
      source.dispose();
    });
  }

  /** Polite shutdown, then the process is ended either way. */
  async shutdown(): Promise<void> {
    if (!this.closed) {
      try {
        await withTimeout(this.connection.sendRequest('shutdown'), SHUTDOWN_TIMEOUT_MS, 'shutdown');
        await this.connection.sendNotification('exit');
      } catch {
        // The process is killed below anyway.
      }
    }
    this.connection.dispose();
    this.transport.kill();
    this.markClosed();
  }
}

export { CancellationTokenSource };
