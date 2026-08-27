import type { AnySignal, AnySignalDefinition, SignalOf } from '../../signal/index.ts';
import type { Dispose, MaybePromise } from '../../types/index.ts';
import { createAsyncEventEmitter } from './emitter.ts';

type SignalHandler = (signal: AnySignal) => MaybePromise<void>;

export interface SignalListener {
  onSignal<TDefinition extends AnySignalDefinition>(
    definition: TDefinition,
    handler: (signal: SignalOf<TDefinition>) => MaybePromise<void>,
  ): Dispose;
}

export interface SignalBus extends SignalListener {
  emitSignal(signal: AnySignal): Promise<void>;
}

export function createSignalBus(): SignalBus {
  const emitter = createAsyncEventEmitter<AnySignal>();

  function onSignal<TDefinition extends AnySignalDefinition>(
    definition: TDefinition,
    handler: (signal: SignalOf<TDefinition>) => MaybePromise<void>,
  ): Dispose {
    const signalHandler = handler as SignalHandler;
    return emitter.on(definition.id, signalHandler);
  }

  async function emitSignal(signal: AnySignal): Promise<void> {
    await emitter.emit(signal.definition.id, signal);
  }

  return {
    emitSignal,
    onSignal,
  };
}
