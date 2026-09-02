import type { DevtoolConsumerMessage, DevtoolProviderMessage } from '@ciels/devtool-protocol';

export type WatchMode = 'autonomous' | 'standard';
export type DanmakuDelivery = 'live' | 'simulate';
export type AppView = 'devtool' | 'watch';

export interface Account {
  readonly face: string;
  readonly name: string;
  readonly uid: number;
}

export interface LiveArea {
  readonly id: number;
  readonly name: string;
  readonly children: readonly LiveArea[];
}

export interface RoomInfo {
  readonly areaName: string;
  readonly description: string;
  readonly live: boolean;
  readonly parentAreaName: string;
  readonly roomId: number;
  readonly streamerName: string;
  readonly title: string;
  readonly uid: number;
}

export interface ConfigurationIssue {
  readonly detail?: string;
  readonly key: string;
  readonly message: string;
}

export interface ConfigurationStatus {
  readonly checkedAt: number;
  readonly dataPath: string;
  readonly issues: readonly ConfigurationIssue[];
  readonly valid: boolean;
}

export type StartOptions =
  | {
      readonly mode: 'standard';
      readonly roomId: number;
      readonly danmakuDelivery: DanmakuDelivery;
    }
  | {
      readonly mode: 'autonomous';
      readonly areaId: number;
      readonly danmakuDelivery: DanmakuDelivery;
    };

export interface AppState {
  readonly account?: Account;
  readonly configuration?: ConfigurationStatus;
  readonly danmakuDelivery: DanmakuDelivery;
  readonly error?: string;
  readonly mode: WatchMode;
  readonly room?: RoomInfo;
  readonly running: boolean;
}

export interface WatchBliveApi {
  readonly account: { login(): Promise<void>; logout(): Promise<void> };
  readonly areas: { list(): Promise<readonly LiveArea[]> };
  readonly devtool: {
    send(message: DevtoolConsumerMessage): void;
    subscribe(listener: (message: DevtoolProviderMessage) => void): () => void;
  };
  readonly runtime: { start(options: StartOptions): Promise<void>; stop(): Promise<void> };
  readonly state: {
    get(): Promise<AppState>;
    subscribe(listener: (state: AppState) => void): () => void;
  };
}
