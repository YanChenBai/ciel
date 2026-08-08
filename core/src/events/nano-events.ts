import { createNanoEvents } from 'nanoevents';
import type { DefaultEvents, EventsMap, Unsubscribe } from 'nanoevents';

export class NanoEvents<Events extends EventsMap = DefaultEvents> {
  private readonly emitter = createNanoEvents<Events>();

  get events() {
    return this.emitter.events;
  }

  on<K extends keyof Events>(event: K, cb: Events[K]): Unsubscribe {
    return this.emitter.on(event, cb);
  }

  protected emit<K extends keyof Events>(event: K, ...args: Parameters<Events[K]>): void {
    this.emitter.emit(event, ...args);
  }
}
