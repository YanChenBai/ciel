import { SIGNAL_DEFINITION_SYMBOL, SIGNAL_SYMBOL } from '../identity.ts';
import type { Temporal } from '../temporal/index.ts';

export interface DefineSignalOptions {
  readonly name: string;

  readonly description: string;
}

export interface SignalDefinition<TPayload = unknown> {
  readonly [SIGNAL_DEFINITION_SYMBOL]: true;

  readonly symbol: symbol;

  readonly name: string;

  readonly description: string;

  readonly create: (payload: TPayload, temporal: Temporal) => Signal<TPayload>;
}

export interface Signal<TPayload = unknown> {
  readonly [SIGNAL_SYMBOL]: true;

  readonly definition: SignalDefinition<TPayload>;

  readonly payload: TPayload;

  readonly temporal: Temporal;
}

export type AnySignalDefinition = SignalDefinition<any>;

export type AnySignal = Signal<any>;

export type SignalOf<TDefinition extends AnySignalDefinition> =
  TDefinition extends SignalDefinition<infer TPayload> ? Signal<TPayload> : never;

export function defineSignal<TPayload = unknown>(
  options: DefineSignalOptions,
): SignalDefinition<TPayload> {
  const definition: SignalDefinition<TPayload> = {
    ...options,

    [SIGNAL_DEFINITION_SYMBOL]: true,

    symbol: Symbol(options.name),

    create(payload: TPayload, temporal: Temporal) {
      return {
        [SIGNAL_SYMBOL]: true,
        definition,
        payload,
        temporal,
      };
    },
  };

  return definition;
}
