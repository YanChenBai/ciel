import type { EmitSignal, SignalListener } from '#model/signal/index.ts';
import type { Dispose, MaybePromise } from '#shared/async.ts';

export type EventHandler<T extends object> = (data: T) => MaybePromise<void>;

export interface AsyncEventEmitter<T extends object> {
  emit(event: PropertyKey, data: T): Promise<void>;
  on(event: PropertyKey, handler: EventHandler<T>): Dispose;
  onAny(handler: EventHandler<T>): Dispose;
}

export interface SignalBus extends SignalListener {
  emitSignal: EmitSignal;
}
