import { EventEmitter } from '@ciels/event';

import type { SensuOutput } from '../sensu/index.ts';
import type { AnySignal, AnySignalDefinition, SignalOf } from '../signal/index.ts';
import type { Dispose, MaybePromise } from '../types.ts';

type SignalHandler = (signal: AnySignal) => MaybePromise<SensuOutput>;

interface SignalBusEvents {
  [event: symbol]: (signal: AnySignal) => MaybePromise<void>;
}

export interface SignalBus {
  on<TDefinition extends AnySignalDefinition>(
    definition: TDefinition,
    handler: (signal: SignalOf<TDefinition>) => MaybePromise<SensuOutput>,
  ): Dispose;

  emit(signal: AnySignal): Promise<void>;
}

export function createSignalBus(accept: (output: SensuOutput) => void): SignalBus {
  const emitter = new EventEmitter<SignalBusEvents>();

  return {
    on(definition, handler) {
      const signalHandler = handler as SignalHandler;
      return emitter.on(definition.symbol, async signal => {
        accept(await signalHandler(signal));
      });
    },

    async emit(signal) {
      await emitter.emitAsync(signal.definition.symbol, signal);
    },
  };
}
