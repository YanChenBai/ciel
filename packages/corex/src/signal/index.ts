import { SIGNAL_DEFINITION_SYMBOL, SIGNAL_SYMBOL } from '#identity';
import type { Temporal } from '#temporal';

export interface DefineSignalOptions {
  readonly name: string;

  readonly description: string;
}

export interface SignalDefinition<TPayload = unknown> {
  readonly [SIGNAL_DEFINITION_SYMBOL]: true;

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

export function defineSignal<TPayload = unknown>(
  options: DefineSignalOptions,
): SignalDefinition<TPayload> {
  const definition: SignalDefinition<TPayload> = {
    ...options,

    [SIGNAL_DEFINITION_SYMBOL]: true,

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
