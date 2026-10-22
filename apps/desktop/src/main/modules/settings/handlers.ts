import type { ModuleHandlers } from '../../ipc/handlers';
import type { SettingsStore } from './store';

export function createSettingsHandlers(settings: SettingsStore): ModuleHandlers<'settings'> {
  return {
    'settings:get': () => settings.get(),
    'settings:update': (patch) => settings.update(patch),
  };
}
