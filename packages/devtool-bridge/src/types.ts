import type {
  DevtoolConsumerMessage,
  DevtoolEventName,
  DevtoolEventPayload,
  DevtoolProviderMessage,
  DevtoolRequestInput,
  DevtoolRequestName,
  DevtoolRequestOutput,
  DevtoolSnapshot,
  TargetDescriptor,
} from '@ciels/devtool-protocol';

export type MaybePromise<T> = T | PromiseLike<T>;
export type Dispose = () => MaybePromise<void>;

export type DevtoolTargetRequestName = Exclude<DevtoolRequestName, 'target.bootstrap'>;

export type DevtoolTargetRequestHandlers = {
  readonly [TName in DevtoolTargetRequestName]: (
    input: DevtoolRequestInput<TName>,
  ) => MaybePromise<DevtoolRequestOutput<TName>>;
};

export type DevtoolTargetEvent = {
  [TName in DevtoolEventName]: {
    readonly name: TName;
    readonly time: number;
    readonly payload: DevtoolEventPayload<TName>;
  };
}[DevtoolEventName];

export type DevtoolTargetEventSubscriber = (event: DevtoolTargetEvent) => MaybePromise<void>;

interface DevtoolTargetBase {
  readonly descriptor: TargetDescriptor;
  readonly requests?: Partial<DevtoolTargetRequestHandlers>;
  snapshot(): MaybePromise<DevtoolSnapshot>;
}

interface DevtoolTargetWithoutEvents {
  readonly events?: readonly [];
  readonly subscribe?: never;
}

interface DevtoolTargetWithEvents {
  readonly events: readonly [DevtoolEventName, ...DevtoolEventName[]];
  subscribe(subscriber: DevtoolTargetEventSubscriber): Dispose;
}

/**
 * 由宿主实现的可调试目标。Bridge 不提供任何具体运行时适配实现。
 */
export type DevtoolTarget = DevtoolTargetBase &
  (DevtoolTargetWithoutEvents | DevtoolTargetWithEvents);

/**
 * 由外部 Transport 实现的单个双向连接。
 */
export interface DevtoolPeer {
  send(message: DevtoolProviderMessage): MaybePromise<void>;
  subscribe(listener: (message: DevtoolConsumerMessage) => MaybePromise<void>): Dispose;
  close?(): MaybePromise<void>;
}

export interface CreateDevtoolBridgeOptions {
  readonly target: DevtoolTarget;
  /**
   * 标识当前 Bridge 事件流实例；运行时重建时必须变化。
   */
  readonly epoch: string;
  /**
   * 为 Welcome、Response 和 Event 生成唯一消息标识。
   */
  readonly createId: () => string;
}

export interface DevtoolBridge {
  readonly target: TargetDescriptor;
  attach(peer: DevtoolPeer): Dispose;
  close(): Promise<void>;
}
