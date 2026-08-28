import type { AnySignal, AnySignalDefinition, SignalHandler } from '#model/signal/index.ts';
import type { Dispose } from '#shared/async.ts';

import { createAsyncEventEmitter } from './emitter.ts';
import type { SignalBus } from './types.ts';

type AnySignalHandler = SignalHandler<AnySignalDefinition>;

export function createSignalBus(): SignalBus {
  const emitter = createAsyncEventEmitter<AnySignal>();

  function onSignal<TDefinition extends AnySignalDefinition>(
    definition: TDefinition,
    handler: SignalHandler<TDefinition>,
  ): Dispose {
    const signalHandler = handler as AnySignalHandler;
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
