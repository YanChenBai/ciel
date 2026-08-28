import type { AnyCue, CueListener } from '#model/cue/index.ts';
import type { Percept, PerceptListener } from '#model/percept/index.ts';
import type { AnySignal, SignalListener } from '#model/signal/index.ts';
import type { Dispose, MaybePromise } from '#shared/async.ts';

export type EventHandler<T extends object> = (data: T) => MaybePromise<void>;

export interface AsyncEventEmitter<T extends object> {
  emit(event: PropertyKey, data: T): Promise<void>;
  on(event: PropertyKey, handler: EventHandler<T>): Dispose;
  onAny(handler: EventHandler<T>): Dispose;
}

export interface CueBus extends CueListener {
  emitCue(cue: AnyCue): Promise<void>;
}

export interface PerceptBus extends PerceptListener {
  emitPercept(percept: Percept): Promise<void>;
}

export interface SignalBus extends SignalListener {
  emitSignal(signal: AnySignal): Promise<void>;
}
