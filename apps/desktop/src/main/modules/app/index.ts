import type { IpcResponse } from '@kestrel/shared';

type AppInfo = IpcResponse<'app:getInfo'>;

export interface AppInfoSource {
  name: string;
  version: string;
  platform: string;
  locale: string;
}

/** Maps raw Electron/Node values to the public AppInfo shape. */
export function toAppInfo(source: AppInfoSource): AppInfo {
  const platform =
    source.platform === 'darwin' || source.platform === 'win32' || source.platform === 'linux'
      ? source.platform
      : 'other';
  return {
    name: source.name,
    version: source.version,
    platform,
    locale: source.locale,
  };
}
