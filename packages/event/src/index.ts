type EventListener = (...args: any[]) => void | Promise<void>;

export type EventMap<Events> = {
  [Event in keyof Events]: EventListener;
};

export type Unsubscribe = () => void;

export class EventEmitter<Events extends EventMap<Events>> {
  private readonly listeners = new Map<keyof Events, Set<EventListener>>();

  on<Event extends keyof Events>(event: Event, listener: Events[Event]): Unsubscribe {
    let eventListeners = this.listeners.get(event);
    if (!eventListeners) {
      eventListeners = new Set();
      this.listeners.set(event, eventListeners);
    }
    eventListeners.add(listener);

    let active = true;
    return () => {
      if (!active) return;
      active = false;
      eventListeners.delete(listener);
      if (eventListeners.size === 0) this.listeners.delete(event);
    };
  }

  once<Event extends keyof Events>(event: Event, listener: Events[Event]): Unsubscribe {
    let unsubscribe: Unsubscribe = () => undefined;
    unsubscribe = this.on(event, ((...args: Parameters<Events[Event]>) => {
      unsubscribe();
      return listener(...args);
    }) as Events[Event]);
    return unsubscribe;
  }

  emit<Event extends keyof Events>(event: Event, ...args: Parameters<Events[Event]>): void {
    const eventListeners = this.listeners.get(event);
    if (!eventListeners) return;
    // Synchronous emission deliberately does not wait for async listeners.
    Array.from(eventListeners).forEach(listener => void listener(...args));
  }

  async emitAsync<Event extends keyof Events>(
    event: Event,
    ...args: Parameters<Events[Event]>
  ): Promise<void> {
    const eventListeners = this.listeners.get(event);
    if (!eventListeners) return;
    // Snapshot listeners so subscriptions changed during emission affect only the next event.
    const pending: Promise<void>[] = [];
    Array.from(eventListeners).forEach(listener => {
      pending.push(Promise.resolve(listener(...args)));
    });
    await Promise.all(pending);
  }

  clear<Event extends keyof Events>(event?: Event): void {
    if (event === undefined) this.listeners.clear();
    else this.listeners.delete(event);
  }
}

export abstract class EventHost<Events extends EventMap<Events>> {
  private readonly emitter = new EventEmitter<Events>();

  on<Event extends keyof Events>(event: Event, listener: Events[Event]): Unsubscribe {
    return this.emitter.on(event, listener);
  }

  once<Event extends keyof Events>(event: Event, listener: Events[Event]): Unsubscribe {
    return this.emitter.once(event, listener);
  }

  protected emit<Event extends keyof Events>(
    event: Event,
    ...args: Parameters<Events[Event]>
  ): void {
    this.emitter.emit(event, ...args);
  }

  protected emitAsync<Event extends keyof Events>(
    event: Event,
    ...args: Parameters<Events[Event]>
  ): Promise<void> {
    return this.emitter.emitAsync(event, ...args);
  }

  protected clearEvents<Event extends keyof Events>(event?: Event): void {
    this.emitter.clear(event);
  }
}
