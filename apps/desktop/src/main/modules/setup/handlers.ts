import type { ModuleHandlers } from '../../ipc/handlers';
import type { SetupService } from './service';

export function createSetupHandlers(setup: SetupService): ModuleHandlers<'setup'> {
  return {
    'setup:hardware': () => setup.hardware(),
    'setup:catalog': () => setup.catalog(),
    'setup:updateCatalog': () => setup.updateCatalog(),
    'setup:ollamaStatus': () => setup.ollamaStatus(),
    'setup:installPlan': () => setup.installPlan(),
    'setup:installOllama': ({ taskId }, { sender }) => setup.installOllama(sender.id, taskId),
    'setup:pullModel': async ({ taskId, model }, { sender }) => {
      await setup.pullModel(sender.id, taskId, model);
      return null;
    },
    'setup:cancel': ({ taskId }, { sender }) => {
      setup.cancel(sender.id, taskId);
      return null;
    },
    'setup:benchmark': ({ model, purpose }) => setup.benchmark(model, purpose),
    'setup:apply': async (choice) => {
      await setup.apply(choice);
      return null;
    },
  };
}
