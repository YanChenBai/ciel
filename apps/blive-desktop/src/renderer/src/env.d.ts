import type { BliveDesktopApi } from '../../shared/types.ts';

declare global {
  interface Window {
    readonly blive: BliveDesktopApi;
  }
}

export {};
