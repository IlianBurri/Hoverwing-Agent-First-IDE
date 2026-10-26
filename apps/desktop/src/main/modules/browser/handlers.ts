import type { ModuleHandlers } from '../../ipc/handlers';
import type { BrowserManager } from './manager';

export function createBrowserHandlers(browser: BrowserManager): ModuleHandlers<'browser'> {
  const done = (action: () => void) => {
    action();
    return null;
  };
  return {
    'browser:create': ({ url }, { sender }) => browser.create(sender.id, url),
    'browser:navigate': ({ tabId, url }, { sender }) =>
      done(() => {
        browser.navigate(sender.id, tabId, url);
      }),
    'browser:back': ({ tabId }, { sender }) =>
      done(() => {
        browser.back(sender.id, tabId);
      }),
    'browser:forward': ({ tabId }, { sender }) =>
      done(() => {
        browser.forward(sender.id, tabId);
      }),
    'browser:reload': ({ tabId }, { sender }) =>
      done(() => {
        browser.reload(sender.id, tabId);
      }),
    'browser:stop': ({ tabId }, { sender }) =>
      done(() => {
        browser.stop(sender.id, tabId);
      }),
    'browser:setBounds': ({ tabId, bounds }, { sender }) =>
      done(() => {
        browser.setBounds(sender.id, tabId, bounds);
      }),
    'browser:openDevTools': ({ tabId }, { sender }) =>
      done(() => {
        browser.openDevTools(sender.id, tabId);
      }),
    'browser:close': ({ tabId }, { sender }) =>
      done(() => {
        browser.close(sender.id, tabId);
      }),
    'browser:clearData': async () => {
      await browser.clearData();
      return null;
    },
  };
}
