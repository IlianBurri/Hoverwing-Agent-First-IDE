import type { KestrelApi } from '../preload/api';

declare global {
  interface Window {
    readonly kestrel: KestrelApi;
  }
}

export {};
