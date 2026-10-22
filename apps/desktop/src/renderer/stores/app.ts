import { create } from 'zustand';
import type { IpcResponse } from '@kestrel/shared';

export type AppInfo = IpcResponse<'app:getInfo'>;

interface AppState {
  info: AppInfo | null;
  setInfo: (info: AppInfo) => void;
}

export const useAppStore = create<AppState>()((set) => ({
  info: null,
  setInfo: (info) => {
    set({ info });
  },
}));
