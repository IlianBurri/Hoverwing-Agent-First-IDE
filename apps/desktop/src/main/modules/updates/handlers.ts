import type { ModuleHandlers } from '../../ipc/handlers';
import type { UpdateService } from './service';

export function createUpdateHandlers(updates: UpdateService): ModuleHandlers<'updates'> {
  return {
    'updates:status': () => updates.get(),
    'updates:check': () => updates.check(),
    'updates:download': async () => {
      await updates.download();
      return null;
    },
    'updates:install': () => {
      updates.install();
      return null;
    },
  };
}
