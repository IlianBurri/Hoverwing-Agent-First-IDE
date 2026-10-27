import type { ModuleHandlers } from '../../ipc/handlers';
import type { WorkspaceManager } from '../workspace';
import type { LspConfigStore } from './configs';
import type { LspService } from './service';

export function createLspHandlers(
  service: LspService,
  configs: LspConfigStore,
  workspaces: WorkspaceManager,
  onConfigsChanged: () => void,
): ModuleHandlers<'lsp'> {
  const changed = async (id: string) => {
    onConfigsChanged();
    await service.configChanged(id);
  };
  return {
    'lsp:open': ({ path, text, version }, { sender }) =>
      service.open(sender.id, workspaces.requireRoot(sender.id), path, text, version),
    'lsp:change': async ({ path, text, version }, { sender }) => {
      await service.change(sender.id, path, text, version);
      return null;
    },
    'lsp:close': async ({ path }, { sender }) => {
      await service.close(sender.id, path);
      return null;
    },
    'lsp:completion': ({ path, position, triggerCharacter, requestId }, { sender }) =>
      service.completion(sender.id, path, position, triggerCharacter, requestId),
    'lsp:hover': ({ path, position, requestId }, { sender }) =>
      service.hover(sender.id, path, position, requestId),
    'lsp:definition': ({ path, position, requestId }, { sender }) =>
      service.definition(sender.id, path, position, requestId),
    'lsp:signatureHelp': ({ path, position, triggerCharacter, requestId }, { sender }) =>
      service.signatureHelp(sender.id, path, position, triggerCharacter, requestId),
    'lsp:cancel': ({ requestId }, { sender }) => {
      service.cancel(sender.id, requestId);
      return null;
    },
    'lsp:diagnostics': (_request, { sender }) => service.diagnostics(sender.id),
    'lsp:status': (_request, { sender }) => service.statuses(sender.id),
    'lsp:restart': async (_request, { sender }) => {
      await service.restart(sender.id);
      return null;
    },
    'lsp:listServers': () => configs.list(),
    'lsp:saveServer': async (config) => {
      const saved = await configs.put(config);
      await changed(config.id);
      return saved;
    },
    'lsp:deleteServer': async ({ id }) => {
      await configs.remove(id);
      await changed(id);
      return null;
    },
  };
}
