import type {
  BilibiliLiveAreaGroup,
  BliveDesktopEvent,
  BliveDesktopState,
  BliveStartOptions,
  LivePageEvent,
  LiveViewBounds,
} from './types.ts';

export const IPC = {
  accountLogin: 'blive:account:login',
  areasList: 'blive:areas:list',
  danmakuSend: 'blive:danmaku:send',
  liveViewSetBounds: 'blive:live-view:set-bounds',
  pageEvent: 'blive:page:event',
  runtimeStart: 'blive:runtime:start',
  runtimeStop: 'blive:runtime:stop',
  stateEvent: 'blive:state:event',
  stateGet: 'blive:state:get',
} as const;

export interface BliveIpcInvokeContract {
  readonly [IPC.accountLogin]: { readonly request: undefined; readonly response: void };
  readonly [IPC.areasList]: {
    readonly request: undefined;
    readonly response: readonly BilibiliLiveAreaGroup[];
  };
  readonly [IPC.danmakuSend]: { readonly request: string; readonly response: void };
  readonly [IPC.runtimeStart]: { readonly request: BliveStartOptions; readonly response: void };
  readonly [IPC.runtimeStop]: { readonly request: undefined; readonly response: void };
  readonly [IPC.stateGet]: { readonly request: undefined; readonly response: BliveDesktopState };
}

export interface BliveIpcSendContract {
  readonly [IPC.liveViewSetBounds]: LiveViewBounds;
  readonly [IPC.pageEvent]: LivePageEvent;
}

export interface BliveIpcEventContract {
  readonly [IPC.stateEvent]: BliveDesktopEvent;
}
