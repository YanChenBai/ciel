import { EventEmitter } from '@ciels/event';

import type { AnySignal, AnySignalDefinition, SignalOf } from '../../signal/index.ts';
import type { Dispose, MaybePromise } from '../../types/index.ts';

type SignalHandler = (signal: AnySignal) => MaybePromise<void>;

interface SignalBusEvents {
  [event: string]: (signal: AnySignal) => MaybePromise<void>;
}

function signalEvent(definition: AnySignalDefinition): string {
  return `signal:${definition.id}`;
}

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
  const emitter = new EventEmitter<SignalBusEvents>();

  function onSignal<TDefinition extends AnySignalDefinition>(
    definition: TDefinition,
    handler: (signal: SignalOf<TDefinition>) => MaybePromise<void>,
  ): Dispose {
    const signalHandler = handler as SignalHandler;
    return emitter.on(signalEvent(definition), signalHandler);
  }

  async function emitSignal(signal: AnySignal): Promise<void> {
    await emitter.emitAsync(signalEvent(signal.definition), signal);
  }

  return {
    emitSignal,
    onSignal,
  };
}
