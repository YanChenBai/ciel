import { SENSU_DEFINITION_SYMBOL, SENSU_SYMBOL } from '../identity.ts';
import type { Percept } from '../percept/index.ts';
import type { AnySignalDefinition, SignalDefinition, SignalOf } from '../signal/index.ts';
import type { Dispose, MaybePromise } from '../types.ts';

export type SensuOutput = Percept | readonly Percept[] | void;

export interface SensuSetupContext<
  TSignals extends readonly AnySignalDefinition[] = readonly AnySignalDefinition[],
> {
  readonly signals: TSignals;

  onSignal<TDefinition extends TSignals[number]>(
    definition: TDefinition,
    handler: (signal: SignalOf<TDefinition>) => MaybePromise<SensuOutput>,
  ): Dispose;

  onDispose(dispose: Dispose): void;
}

export interface DefineSensuOptions<
  TSignals extends readonly AnySignalDefinition[] = readonly AnySignalDefinition[],
> {
  readonly name: string;

  readonly description: string;

  setup(ctx: SensuSetupContext<TSignals>): MaybePromise<void>;
}

export interface Sensu<
  TSignals extends readonly AnySignalDefinition[] = readonly AnySignalDefinition[],
> extends DefineSensuOptions<TSignals> {
  readonly [SENSU_SYMBOL]: true;

  readonly symbol: symbol;

  readonly signals: TSignals;
}

export interface SensuDefinition<TPayload = unknown> {
  readonly [SENSU_DEFINITION_SYMBOL]: true;

  <const TSignals extends readonly SignalDefinition<TPayload>[]>(
    ...signals: TSignals
  ): Sensu<TSignals>;
}

export function defineSensu<TPayload = unknown>(
  factory: (
    ...signals: readonly SignalDefinition<TPayload>[]
  ) => DefineSensuOptions<readonly SignalDefinition<TPayload>[]>,
): SensuDefinition<TPayload> {
  const definition = (<const TSignals extends readonly SignalDefinition<TPayload>[]>(
    ...signals: TSignals
  ): Sensu<TSignals> => {
    const options = factory(...signals);

    return {
      [SENSU_SYMBOL]: true,
      name: options.name,
      description: options.description,
      symbol: Symbol(options.name),
      signals,
      setup: ctx => options.setup(ctx),
    };
  }) as SensuDefinition<TPayload>;

  Object.defineProperty(definition, SENSU_DEFINITION_SYMBOL, {
    value: true,
  });

  return definition;
}
