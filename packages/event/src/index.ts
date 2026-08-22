type EventListener = (...args: any[]) => void | Promise<void>;

/**
 * 将事件名称映射到对应的监听器签名
 */
export type EventMap<Events> = {
  [Event in keyof Events]: EventListener;
};

/**
 * 取消单个事件订阅
 */
export type Unsubscribe = () => void;

/**
 * 将事件名称映射为对应的订阅方法
 */
export type EventSubscriptions<Events extends EventMap<Events>> = {
  readonly [Event in keyof Events]: (listener: Events[Event]) => Unsubscribe;
};

/**
 * 将事件名称映射为对应的同步触发方法
 */
export type EventEmissions<Events extends EventMap<Events>> = {
  readonly [Event in keyof Events]: (...args: Parameters<Events[Event]>) => void;
};

/**
 * 将事件名称映射为对应的异步触发方法
 */
export type EventAsyncEmissions<Events extends EventMap<Events>> = {
  readonly [Event in keyof Events]: (...args: Parameters<Events[Event]>) => Promise<void>;
};

/**
 * 筛选源与目标中名称相同且参数兼容的事件
 */
export type InheritableEvents<
  TargetEvents extends EventMap<TargetEvents>,
  SourceEvents extends EventMap<SourceEvents>,
> = {
  [Event in keyof TargetEvents & keyof SourceEvents]: Parameters<
    SourceEvents[Event]
  > extends Parameters<TargetEvents[Event]>
    ? Event
    : never;
}[keyof TargetEvents & keyof SourceEvents];

/**
 * 将任意抛出值规范化为 Error
 */
export function toError(error: unknown): Error {
  return error instanceof Error ? error : new Error(String(error));
}

/**
 * 提供类型安全的事件订阅与触发能力
 */
export class EventEmitter<Events extends EventMap<Events>> {
  /**
   * 按事件名称保存已注册的监听器
   */
  private readonly listeners = new Map<keyof Events, Set<EventListener>>();

  /**
   * 按事件名称订阅事件
   */
  readonly $on = this.createSubscriptions((event, listener) => this.on(event, listener));

  /**
   * 按事件名称订阅只会执行一次的事件
   */
  readonly $once = this.createSubscriptions((event, listener) => this.once(event, listener));

  /**
   * 按事件名称同步触发事件
   */
  readonly $emit = new Proxy({} as EventEmissions<Events>, {
    get:
      (_target, event) =>
      (...args: Parameters<Events[keyof Events]>) =>
        this.emit(event as keyof Events, ...args),
  });

  /**
   * 按事件名称触发事件并等待全部监听器完成
   */
  readonly $emitAsync = new Proxy({} as EventAsyncEmissions<Events>, {
    get:
      (_target, event) =>
      (...args: Parameters<Events[keyof Events]>) =>
        this.emitAsync(event as keyof Events, ...args),
  });

  /**
   * 订阅事件并返回对应的取消订阅函数
   */
  on<Event extends keyof Events>(event: Event, listener: Events[Event]): Unsubscribe {
    let eventListeners = this.listeners.get(event);
    if (!eventListeners) {
      eventListeners = new Set();
      this.listeners.set(event, eventListeners);
    }
    eventListeners.add(listener);

    let active = true;
    return () => {
      if (!active) {
        return;
      }
      active = false;
      eventListeners.delete(listener);
      if (eventListeners.size === 0) {
        this.listeners.delete(event);
      }
    };
  }

  /**
   * 订阅只会执行一次的事件监听器
   */
  once<Event extends keyof Events>(event: Event, listener: Events[Event]): Unsubscribe {
    let unsubscribe: Unsubscribe = () => undefined;
    unsubscribe = this.on(event, ((...args: Parameters<Events[Event]>) => {
      unsubscribe();
      return listener(...args);
    }) as Events[Event]);
    return unsubscribe;
  }

  /**
   * 同步触发事件，不等待异步监听器完成
   */
  emit<Event extends keyof Events>(event: Event, ...args: Parameters<Events[Event]>): void {
    const eventListeners = this.listeners.get(event);
    if (!eventListeners) {
      return;
    }
    // 同步触发不会等待异步监听器。
    Array.from(eventListeners).forEach(listener => void listener(...args));
  }

  /**
   * 触发事件并等待全部同步及异步监听器完成
   */
  async emitAsync<Event extends keyof Events>(
    event: Event,
    ...args: Parameters<Events[Event]>
  ): Promise<void> {
    const eventListeners = this.listeners.get(event);
    if (!eventListeners) {
      return;
    }
    // 固定本轮监听器快照，触发期间的订阅变化从下一次事件开始生效。
    const pending: Promise<void>[] = [];
    Array.from(eventListeners).forEach(listener => {
      pending.push(Promise.resolve(listener(...args)));
    });
    await Promise.all(pending);
  }

  /**
   * 清除指定事件或全部事件的监听器
   */
  clear<Event extends keyof Events>(event?: Event): void {
    if (event === undefined) {
      this.listeners.clear();
    } else {
      this.listeners.delete(event);
    }
  }

  /**
   * 创建按事件名称访问的订阅方法集合
   */
  private createSubscriptions(
    subscribe: <Event extends keyof Events>(event: Event, listener: Events[Event]) => Unsubscribe,
  ): EventSubscriptions<Events> {
    return new Proxy({} as EventSubscriptions<Events>, {
      get: (_target, event) => (listener: Events[keyof Events]) =>
        subscribe(event as keyof Events, listener),
    });
  }
}

/**
 * 为领域对象提供受保护的事件触发能力和公开的订阅 API
 */
export abstract class EventHost<Events extends EventMap<Events>> {
  /**
   * 承载该 Host 全部事件监听器的内部发射器
   */
  private readonly emitter = new EventEmitter<Events>();

  /**
   * 按事件名称订阅该 Host 的事件
   */
  readonly $on = this.emitter.$on;

  /**
   * 按事件名称订阅只会执行一次的 Host 事件
   */
  readonly $once = this.emitter.$once;

  /**
   * 按事件名称同步触发 Host 事件
   */
  protected readonly $emit = this.emitter.$emit;

  /**
   * 按事件名称触发 Host 事件并等待全部监听器完成
   */
  protected readonly $emitAsync = this.emitter.$emitAsync;

  /**
   * 订阅该 Host 的事件
   */
  on<Event extends keyof Events>(event: Event, listener: Events[Event]): Unsubscribe {
    return this.emitter.on(event, listener);
  }

  /**
   * 订阅只会执行一次的 Host 事件
   */
  once<Event extends keyof Events>(event: Event, listener: Events[Event]): Unsubscribe {
    return this.emitter.once(event, listener);
  }

  /**
   * 清除该 Host 的全部事件监听器注册
   */
  clearAllEvents(): void {
    this.emitter.clear();
  }

  /**
   * 同步触发 Host 事件
   */
  protected emit<Event extends keyof Events>(
    event: Event,
    ...args: Parameters<Events[Event]>
  ): void {
    this.emitter.emit(event, ...args);
  }

  /**
   * 触发 Host 事件并等待全部监听器完成
   */
  protected emitAsync<Event extends keyof Events>(
    event: Event,
    ...args: Parameters<Events[Event]>
  ): Promise<void> {
    return this.emitter.emitAsync(event, ...args);
  }

  /**
   * 清除指定事件或全部事件的监听器注册
   */
  protected clearEvents<Event extends keyof Events>(event?: Event): void {
    this.emitter.clear(event);
  }

  /**
   * 将另一个事件源中名称与参数兼容的事件转发为当前 Host 的事件
   */
  protected inheritEvents<SourceEvents extends EventMap<SourceEvents>>(
    source: EventHost<SourceEvents>,
    ...events: InheritableEvents<Events, SourceEvents>[]
  ): Unsubscribe {
    const unsubscribes = events.map(event =>
      source.on(event, ((...args: Parameters<SourceEvents[typeof event]>) => {
        this.emitter.emit(event, ...(args as unknown as Parameters<Events[typeof event]>));
      }) as SourceEvents[typeof event]),
    );
    return () => unsubscribes.forEach(unsubscribe => unsubscribe());
  }
}
