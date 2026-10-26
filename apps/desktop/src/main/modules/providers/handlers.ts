import type { ModuleHandlers } from '../../ipc/handlers';
import type { ProviderService } from './service';

export function createProviderHandlers(providers: ProviderService): ModuleHandlers<'providers'> {
  return {
    'providers:list': () => providers.list(),
    'providers:save': (config) => providers.save(config),
    'providers:delete': async ({ id }) => {
      await providers.delete(id);
      return null;
    },
    'providers:setApiKey': async ({ id, value }) => {
      await providers.setApiKey(id, value);
      return null;
    },
    'providers:test': ({ id }) => providers.test(id),
  };
}
