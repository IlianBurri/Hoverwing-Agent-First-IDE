import { useEffect, useState } from 'react';
import type { IpcResponse } from '@kestrel/shared';

type AppInfo = IpcResponse<'app:getInfo'>;

export type AppInfoState =
  { status: 'loading' } | { status: 'ready'; info: AppInfo } | { status: 'error'; message: string };

export function useAppInfo(): AppInfoState {
  const [state, setState] = useState<AppInfoState>({ status: 'loading' });

  useEffect(() => {
    let active = true;
    window.kestrel
      .invoke('app:getInfo')
      .then((result) => {
        if (!active) return;
        setState(
          result.ok
            ? { status: 'ready', info: result.data }
            : { status: 'error', message: result.error.message },
        );
      })
      .catch((error: unknown) => {
        if (active) setState({ status: 'error', message: String(error) });
      });
    return () => {
      active = false;
    };
  }, []);

  return state;
}
