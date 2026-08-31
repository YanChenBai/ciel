import type { WatchBliveApi } from '../../shared/types.ts';

declare global {
  interface Window {
    readonly watchBlive: WatchBliveApi;
  }
}

export {};
