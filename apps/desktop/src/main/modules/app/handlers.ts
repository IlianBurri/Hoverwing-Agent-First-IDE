import { app, clipboard, shell } from 'electron';
import type { ModuleHandlers } from '../../ipc/handlers';
import { toAppInfo } from './index';

export function createAppHandlers(): ModuleHandlers<'app'> {
  return {
    'app:getInfo': () =>
      toAppInfo({
        name: app.getName(),
        version: app.getVersion(),
        platform: process.platform,
        locale: app.getLocale(),
      }),
    'app:openExternalUrl': async ({ url }) => {
      // The schema only lets http(s) through; other schemes could start apps.
      await shell.openExternal(url);
      return null;
    },
    'app:writeClipboard': async ({ text }) => {
      await clipboard.writeText(text);
      return null;
    },
  };
}
