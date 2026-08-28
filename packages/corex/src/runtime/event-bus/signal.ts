import type { AnySignal, AnySignalDefinition, SignalOf } from '#model/signal/index.ts';
import type { Dispose, MaybePromise } from '#shared/async.ts';

import { createAsyncEventEmitter } from './emitter.ts';
import type { SignalBus } from './types.ts';

type SignalHandler = (signal: AnySignal) => MaybePromise<void>;

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
