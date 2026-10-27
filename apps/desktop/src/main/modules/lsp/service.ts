import type {
  CompletionList,
  Diagnostic,
  FileChange,
  FileDiagnostics,
  Hover,
  Location,
  LspPosition,
  LspServerState,
  LspServerStatus,
  LspServerView,
  SignatureHelp,
} from '@kestrel/shared';
import { isSensitivePath, languageIdFor } from '@kestrel/shared';
import type * as Lsp from 'vscode-languageserver-protocol';
import { redact } from '../../lib/redact';
import { CancellationTokenSource, LspClient } from './client';
import type { LspConfigStore } from './configs';
import * as convert from './convert';
import type { StartLspTransport } from './transport';

/** A crashed server is started again this often, then it stays in "error". */
const MAX_RESTARTS = 3;

export interface LspServiceDeps {
  configs: LspConfigStore;
  isTrusted: (root: string) => Promise<boolean>;
  /** Native confirmation of a new command line. */
  confirmStart: (ownerId: number, server: LspServerView) => Promise<boolean>;
  /** Whether the program exists (PATH lookup, PATHEXT on Windows). */
  programExists: (command: string, cwd: string) => Promise<boolean>;
  startTransport: StartLspTransport;
  env: () => Record<string, string>;
  events: {
    diagnostics: (ownerId: number, diagnostics: FileDiagnostics) => void;
    status: (ownerId: number, statuses: LspServerStatus[]) => void;
    log: (line: string) => void;
  };
  /** First restart delay after a crash (doubles each time). */
  restartDelayMs?: number;
}

interface ServerInstance {
  server: LspServerView;
  state: LspServerState;
  client: LspClient | null;
  /** Resolves when the server is ready (or failed: null). */
  ready: Promise<LspClient | null>;
  restarts: number;
  /** Stopped on purpose: a closed connection is not a crash. */
  stopped: boolean;
}

interface OpenDocument {
  serverId: string;
  version: number;
  text: string;
}

interface WindowState {
  root: string;
  servers: Map<string, ServerInstance>;
  documents: Map<string, OpenDocument>;
  diagnostics: Map<string, Diagnostic[]>;
  requests: Map<string, CancellationTokenSource>;
}

type Feature = 'completion' | 'hover' | 'definition' | 'signatureHelp';

/**
 * Language servers per window: started lazily for the first open file of
 * their languages, only in trusted projects, and only after the command
 * line was confirmed natively. Documents are the editor's models (synced
 * as full text), never read from disk here.
 */
export class LspService {
  private readonly windows = new Map<number, WindowState>();

  constructor(private readonly deps: LspServiceDeps) {}

  private window(ownerId: number, root: string): WindowState {
    let state = this.windows.get(ownerId);
    if (state && state.root !== root) {
      this.release(ownerId);
      state = undefined;
    }
    if (!state) {
      state = {
        root,
        servers: new Map(),
        documents: new Map(),
        diagnostics: new Map(),
        requests: new Map(),
      };
      this.windows.set(ownerId, state);
    }
    return state;
  }

  statuses(ownerId: number): LspServerStatus[] {
    const state = this.windows.get(ownerId);
    if (!state) return [];
    return [...state.servers.values()].map((instance) => ({
      serverId: instance.server.id,
      name: instance.server.name,
      state: instance.state,
    }));
  }

  private emitStatus(ownerId: number): void {
    this.deps.events.status(ownerId, this.statuses(ownerId));
  }

  diagnostics(ownerId: number): FileDiagnostics[] {
    const state = this.windows.get(ownerId);
    if (!state) return [];
    return [...state.diagnostics.entries()]
      .filter(([, diagnostics]) => diagnostics.length > 0)
      .map(([path, diagnostics]) => ({ path, diagnostics }));
  }

  private setDiagnostics(ownerId: number, state: WindowState, file: FileDiagnostics): void {
    if (file.diagnostics.length === 0) state.diagnostics.delete(file.path);
    else state.diagnostics.set(file.path, file.diagnostics);
    this.deps.events.diagnostics(ownerId, file);
  }

  /** Clears the diagnostics of every document a server handled. */
  private clearDiagnostics(ownerId: number, state: WindowState, serverId: string | null): void {
    for (const path of [...state.diagnostics.keys()]) {
      const document = state.documents.get(path);
      if (serverId === null || !document || document.serverId === serverId) {
        this.setDiagnostics(ownerId, state, { path, diagnostics: [] });
      }
    }
  }

  /**
   * Starts tracking a document. `served` means a server is configured for
   * the file, so the renderer should send changes (even while the project
   * is untrusted: trusting it later starts the server with current text).
   */
  async open(
    ownerId: number,
    root: string,
    path: string,
    text: string,
    version: number,
  ): Promise<{ served: boolean }> {
    // Secrets never go to a language server.
    if (isSensitivePath(path)) return { served: false };
    const server = await this.deps.configs.forPath(path);
    if (!server) return { served: false };
    const state = this.window(ownerId, root);
    if (state.documents.get(path)?.serverId === server.id) {
      await this.change(ownerId, path, text, version);
      return { served: true };
    }
    state.documents.set(path, { serverId: server.id, version, text });
    const instance = state.servers.get(server.id);
    if (instance?.state === 'ready' && instance.client) {
      await instance.client.open(convert.toUri(root, path), languageIdFor(path), version, text);
    } else {
      // Not awaited (an npx download can take a while). A starting server
      // opens every document of its languages once it is ready.
      void this.ensureServer(ownerId, state, server);
    }
    return { served: true };
  }

  async change(ownerId: number, path: string, text: string, version: number): Promise<void> {
    const state = this.windows.get(ownerId);
    const document = state?.documents.get(path);
    if (!state || !document) return;
    document.text = text;
    document.version = version;
    const instance = state.servers.get(document.serverId);
    if (instance?.state === 'ready' && instance.client) {
      await instance.client.change(convert.toUri(state.root, path), version, text);
    }
  }

  async close(ownerId: number, path: string): Promise<void> {
    const state = this.windows.get(ownerId);
    const document = state?.documents.get(path);
    if (!state || !document) return;
    state.documents.delete(path);
    const instance = state.servers.get(document.serverId);
    if (instance?.state === 'ready' && instance.client) {
      await instance.client.close(convert.toUri(state.root, path));
    }
  }

  private ensureServer(
    ownerId: number,
    state: WindowState,
    server: LspServerView,
  ): Promise<LspClient | null> {
    const existing = state.servers.get(server.id);
    if (existing) return existing.ready;
    const instance: ServerInstance = {
      server,
      state: 'starting',
      client: null,
      ready: Promise.resolve(null),
      restarts: 0,
      stopped: false,
    };
    state.servers.set(server.id, instance);
    instance.ready = this.start(ownerId, state, instance);
    return instance.ready;
  }

  private setState(ownerId: number, instance: ServerInstance, value: LspServerState): void {
    instance.state = value;
    this.emitStatus(ownerId);
  }

  private async start(
    ownerId: number,
    state: WindowState,
    instance: ServerInstance,
  ): Promise<LspClient | null> {
    const { server } = instance;
    if (!(await this.deps.isTrusted(state.root))) {
      // Not an error: trusting the project starts it.
      state.servers.delete(server.id);
      return null;
    }
    this.emitStatus(ownerId);
    if (!server.approved) {
      if (!(await this.deps.confirmStart(ownerId, server))) {
        this.setState(ownerId, instance, 'declined');
        return null;
      }
      await this.deps.configs.approve(server);
      instance.server = { ...server, approved: true };
    }
    if (!(await this.deps.programExists(server.command, state.root))) {
      this.deps.events.log(`${server.name}: program "${server.command}" not found.`);
      this.setState(ownerId, instance, 'missing');
      return null;
    }
    try {
      const transport = await this.deps.startTransport({
        command: server.command,
        args: server.args,
        cwd: state.root,
        env: this.deps.env(),
      });
      const client = new LspClient(transport, state.root, {
        diagnostics: (params) => {
          const file = convert.diagnostics(state.root, params);
          if (file && this.windows.get(ownerId) === state) {
            this.setDiagnostics(ownerId, state, file);
          }
        },
        log: (line) => {
          this.deps.events.log(redact(`${server.name}: ${line}`));
        },
        closed: () => {
          this.onClosed(ownerId, state, instance, client);
        },
      });
      instance.client = client;
      await client.initialize();
      if (instance.stopped) return null;
      this.setState(ownerId, instance, 'ready');
      // Documents opened while the server was starting (or before a restart).
      for (const [path, document] of state.documents) {
        if (document.serverId !== server.id) continue;
        await client.open(
          convert.toUri(state.root, path),
          languageIdFor(path),
          document.version,
          document.text,
        );
      }
      return client;
    } catch (error) {
      this.deps.events.log(redact(`${server.name}: could not start (${String(error)})`));
      instance.client?.shutdown().catch(() => undefined);
      instance.client = null;
      if (!instance.stopped) this.setState(ownerId, instance, 'error');
      return null;
    }
  }

  private onClosed(
    ownerId: number,
    state: WindowState,
    instance: ServerInstance,
    client: LspClient,
  ): void {
    if (instance.stopped || instance.client !== client) return;
    instance.client = null;
    this.clearDiagnostics(ownerId, state, instance.server.id);
    if (instance.state !== 'ready' || instance.restarts >= MAX_RESTARTS) {
      this.deps.events.log(`${instance.server.name}: stopped unexpectedly.`);
      this.setState(ownerId, instance, 'error');
      return;
    }
    instance.restarts += 1;
    const delay = (this.deps.restartDelayMs ?? 1000) * 2 ** (instance.restarts - 1);
    this.deps.events.log(`${instance.server.name}: stopped unexpectedly, restarting …`);
    this.setState(ownerId, instance, 'starting');
    setTimeout(() => {
      if (instance.stopped || this.windows.get(ownerId) !== state) return;
      instance.ready = this.start(ownerId, state, instance);
    }, delay).unref();
  }

  private stopServers(ownerId: number, state: WindowState): void {
    for (const instance of state.servers.values()) {
      instance.stopped = true;
      void instance.client?.shutdown().catch(() => undefined);
    }
    state.servers.clear();
    for (const source of state.requests.values()) source.cancel();
    state.requests.clear();
    this.clearDiagnostics(ownerId, state, null);
    this.emitStatus(ownerId);
  }

  /** Starts the servers for the open documents again (after trust or a config change). */
  private async reopen(ownerId: number, state: WindowState): Promise<void> {
    const ids = new Set([...state.documents.values()].map((document) => document.serverId));
    for (const id of ids) {
      const server = await this.deps.configs.get(id);
      if (server?.enabled) await this.ensureServer(ownerId, state, server);
    }
  }

  /** "Restart language servers": stops them; open documents start them again. */
  async restart(ownerId: number): Promise<void> {
    const state = this.windows.get(ownerId);
    if (!state) return;
    this.stopServers(ownerId, state);
    // Re-assign documents to the current configuration (it may have changed).
    for (const [path, document] of [...state.documents]) {
      const server = await this.deps.configs.forPath(path);
      if (server) document.serverId = server.id;
      else state.documents.delete(path);
    }
    await this.reopen(ownerId, state);
  }

  /** Trust of a folder changed: stop or start the servers of its windows. */
  async trustChanged(root: string, trusted: boolean): Promise<void> {
    for (const [ownerId, state] of this.windows) {
      if (state.root !== root) continue;
      if (trusted) await this.reopen(ownerId, state);
      else this.stopServers(ownerId, state);
    }
  }

  /** A server configuration changed: restart windows that use it. */
  async configChanged(serverId: string): Promise<void> {
    for (const [ownerId, state] of this.windows) {
      const uses =
        state.servers.has(serverId) ||
        [...state.documents.values()].some((document) => document.serverId === serverId);
      if (uses) await this.restart(ownerId);
    }
  }

  /** Files changed on disk (workspace watcher). */
  async filesChanged(ownerId: number, changes: readonly FileChange[]): Promise<void> {
    const state = this.windows.get(ownerId);
    if (!state) return;
    const types = { create: 1, update: 2, delete: 3 } as const;
    const events = changes.map((change) => ({
      uri: convert.toUri(state.root, change.path),
      type: types[change.type],
    }));
    for (const instance of state.servers.values()) {
      if (instance.state === 'ready') await instance.client?.watchedFilesChanged(events);
    }
  }

  cancel(ownerId: number, requestId: string): void {
    this.windows.get(ownerId)?.requests.get(requestId)?.cancel();
  }

  /** Runs one request against the document's server; failures give `fallback`. */
  private async ask<T>(
    ownerId: number,
    path: string,
    feature: Feature,
    method: string,
    params: (uri: string) => unknown,
    convertResult: (result: unknown, root: string) => T,
    fallback: T,
    requestId: string | undefined,
  ): Promise<T> {
    const state = this.windows.get(ownerId);
    const document = state?.documents.get(path);
    if (!state || !document) return fallback;
    const instance = state.servers.get(document.serverId);
    const client = instance?.state === 'ready' ? instance.client : null;
    if (!client?.supports(feature)) return fallback;
    const source = new CancellationTokenSource();
    if (requestId) state.requests.set(requestId, source);
    try {
      const result = await client.request(
        method,
        params(convert.toUri(state.root, path)),
        source.token,
      );
      return convertResult(result, state.root);
    } catch {
      // Cancelled, timed out or failed: Monaco simply shows nothing.
      return fallback;
    } finally {
      if (requestId) state.requests.delete(requestId);
      source.dispose();
    }
  }

  completion(
    ownerId: number,
    path: string,
    position: LspPosition,
    triggerCharacter: string | undefined,
    requestId?: string,
  ): Promise<CompletionList> {
    return this.ask(
      ownerId,
      path,
      'completion',
      'textDocument/completion',
      (uri) => ({
        textDocument: { uri },
        position,
        context: triggerCharacter ? { triggerKind: 2, triggerCharacter } : { triggerKind: 1 },
      }),
      (result) => convert.completion(result as Lsp.CompletionList | Lsp.CompletionItem[] | null),
      { items: [], incomplete: false },
      requestId,
    );
  }

  hover(
    ownerId: number,
    path: string,
    position: LspPosition,
    requestId?: string,
  ): Promise<Hover | null> {
    return this.ask(
      ownerId,
      path,
      'hover',
      'textDocument/hover',
      (uri) => ({ textDocument: { uri }, position }),
      (result) => convert.hover(result as Lsp.Hover | null),
      null,
      requestId,
    );
  }

  definition(
    ownerId: number,
    path: string,
    position: LspPosition,
    requestId?: string,
  ): Promise<Location[]> {
    return this.ask(
      ownerId,
      path,
      'definition',
      'textDocument/definition',
      (uri) => ({ textDocument: { uri }, position }),
      (result, root) =>
        convert
          .locations(root, result as Lsp.Location | Lsp.Location[] | Lsp.LocationLink[] | null)
          .filter((location) => !isSensitivePath(location.path)),
      [],
      requestId,
    );
  }

  signatureHelp(
    ownerId: number,
    path: string,
    position: LspPosition,
    triggerCharacter: string | undefined,
    requestId?: string,
  ): Promise<SignatureHelp | null> {
    return this.ask(
      ownerId,
      path,
      'signatureHelp',
      'textDocument/signatureHelp',
      (uri) => ({
        textDocument: { uri },
        position,
        context: {
          triggerKind: triggerCharacter ? 2 : 1,
          isRetrigger: false,
          ...(triggerCharacter ? { triggerCharacter } : {}),
        },
      }),
      (result) => convert.signatureHelp(result as Lsp.SignatureHelp | null),
      null,
      requestId,
    );
  }

  /** The window closed or reloaded: end its servers. */
  release(ownerId: number): void {
    const state = this.windows.get(ownerId);
    if (!state) return;
    for (const instance of state.servers.values()) {
      instance.stopped = true;
      void instance.client?.shutdown().catch(() => undefined);
    }
    for (const source of state.requests.values()) source.cancel();
    this.windows.delete(ownerId);
  }

  releaseAll(): void {
    for (const ownerId of [...this.windows.keys()]) this.release(ownerId);
  }
}
