import type {
  DevtoolCapabilities,
  DevtoolConsumerMessage,
  DevtoolEvent,
  DevtoolProviderMessage,
  DevtoolRequestInput,
  DevtoolRequestName,
  DevtoolRequestOutput,
  DevtoolWelcome,
  TargetDescriptor,
} from '@ciels/devtool-protocol';

export type MaybePromise<T> = T | PromiseLike<T>;
export type Dispose = () => MaybePromise<void>;

/**
 * 由宿主提供的传输连接。Devtoolx 不实现 WebSocket 或其他具体传输。
 */
export interface DevtoolConnection {
  send(message: DevtoolConsumerMessage): MaybePromise<void>;
  subscribe(listener: (message: DevtoolProviderMessage) => MaybePromise<void>): Dispose;
}

export type DevtoolClientStatus = 'idle' | 'connecting' | 'connected' | 'closed';

export type DevtoolClientNotification =
  | {
      readonly type: 'status.changed';
      readonly status: DevtoolClientStatus;
    }
  | {
      readonly type: 'welcome.received';
      readonly welcome: DevtoolWelcome;
    }
  | {
      readonly type: 'event.received';
      readonly event: DevtoolEvent;
    };

export interface CreateDevtoolClientOptions {
  readonly connection: DevtoolConnection;
  readonly createId: () => string;
  readonly client: {
    readonly name: string;
    readonly version?: string;
  };
}

export interface DevtoolClient {
  readonly status: DevtoolClientStatus;
  readonly target?: TargetDescriptor;
  readonly capabilities?: DevtoolCapabilities;
  connect(): Promise<DevtoolWelcome>;
  request<TName extends DevtoolRequestName>(
    name: TName,
    payload: DevtoolRequestInput<TName>,
  ): Promise<DevtoolRequestOutput<TName>>;
  subscribe(listener: (notification: DevtoolClientNotification) => void): Dispose;
  close(): Promise<void>;
}
