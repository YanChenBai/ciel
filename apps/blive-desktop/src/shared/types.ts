import type { AnyVigiliaEvent, VigiliaSnapshot } from '@ciels/core';

export type BliveMode = 'autonomous' | 'standard';
export type DanmakuDelivery = 'live' | 'simulate';

export interface BilibiliAccount {
  readonly face: string;
  readonly name: string;
  readonly uid: number;
}

export interface BilibiliLiveArea {
  readonly id: number;
  readonly name: string;
}

export interface BilibiliLiveAreaGroup extends BilibiliLiveArea {
  readonly areas: readonly BilibiliLiveArea[];
}

interface BliveStartCommonOptions {
  readonly danmakuDelivery: DanmakuDelivery;
}

export type BliveStartOptions =
  | (BliveStartCommonOptions & {
      readonly mode: 'autonomous';
      readonly areaUrl: string;
      readonly roomId?: never;
    })
  | (BliveStartCommonOptions & {
      readonly mode: 'standard';
      readonly areaUrl?: never;
      readonly roomId: number;
    });

export interface LiveRoomInfo {
  readonly areaName: string;
  readonly cover?: string;
  readonly description: string;
  readonly live: boolean;
  readonly parentAreaName: string;
  readonly roomId: number;
  readonly streamerName: string;
  readonly title: string;
  readonly uid: number;
}

export interface SentDanmaku {
  readonly content: string;
  readonly roomId: number;
  readonly sentAt: number;
}

export interface LiveRoomCandidate {
  readonly anchor: string;
  readonly roomId: number;
  readonly title: string;
}

export interface BliveThought {
  readonly action: 'explore' | 'stay';
  readonly confidence: number;
  readonly evidence: readonly string[];
  readonly reason: string;
  readonly score: number;
}

export type LivePageEvent =
  | {
      readonly type: 'danmaku-sent';
      readonly content: string;
      readonly roomId?: number;
      readonly time: number;
    }
  | { readonly type: 'live-ended'; readonly roomId?: number; readonly time: number }
  | { readonly type: 'page-ready'; readonly roomId?: number; readonly time: number }
  | { readonly type: 'room-info'; readonly info: Partial<LiveRoomInfo>; readonly time: number };

export interface BliveDesktopState {
  readonly account?: BilibiliAccount;
  readonly assetBaseUrl?: string;
  readonly connected: boolean;
  readonly danmakuDelivery: DanmakuDelivery;
  readonly error?: string;
  readonly events: readonly AnyVigiliaEvent[];
  readonly history: readonly SentDanmaku[];
  readonly mode: BliveMode;
  readonly room?: LiveRoomInfo;
  readonly running: boolean;
  readonly snapshot: VigiliaSnapshot;
}

export type BliveDesktopEvent =
  | { readonly type: 'state'; readonly state: BliveDesktopState }
  | {
      readonly type: 'vigilia';
      readonly event: AnyVigiliaEvent;
      readonly snapshot: VigiliaSnapshot;
    };

export interface LiveViewBounds {
  readonly height: number;
  readonly width: number;
  readonly x: number;
  readonly y: number;
}

export interface BliveDesktopApi {
  readonly account: {
    login(): Promise<void>;
    logout(): Promise<void>;
  };
  readonly areas: {
    list(): Promise<readonly BilibiliLiveAreaGroup[]>;
  };
  readonly danmaku: {
    send(content: string): Promise<void>;
  };
  readonly liveView: {
    setBounds(bounds: LiveViewBounds): void;
  };
  readonly runtime: {
    start(options: BliveStartOptions): Promise<void>;
    stop(): Promise<void>;
  };
  readonly state: {
    get(): Promise<BliveDesktopState>;
    subscribe(listener: (event: BliveDesktopEvent) => void): () => void;
  };
}
