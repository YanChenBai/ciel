import { STIMULUS_SYMBOL } from '../identity.ts';
import type { AnySignalDefinition, SignalOf } from '../signal/index.ts';
import type { Dispose, MaybePromise } from '../types.ts';

export type SignalDefinitions =
  | readonly AnySignalDefinition[]
  | Readonly<Record<string, AnySignalDefinition>>;

export type SignalDefinitionOf<TSignals extends SignalDefinitions> =
  TSignals extends readonly AnySignalDefinition[] ? TSignals[number] : TSignals[keyof TSignals];

export interface StimulusSetupContext<TSignals extends SignalDefinitions = SignalDefinitions> {
  readonly signals: TSignals;

  emitSignal(signal: SignalOf<SignalDefinitionOf<TSignals>>): Promise<void>;

  onDispose(dispose: Dispose): void;
}

export interface DefineStimulusOptions<TSignals extends SignalDefinitions> {
  readonly name: string;

  readonly description: string;

  readonly signals: TSignals;

  setup(ctx: StimulusSetupContext<TSignals>): MaybePromise<void>;
}

export interface Stimulus<
  TSignals extends SignalDefinitions = SignalDefinitions,
> extends DefineStimulusOptions<TSignals> {
  readonly [STIMULUS_SYMBOL]: true;

  readonly symbol: symbol;
}

export function defineStimulus<const TSignals extends SignalDefinitions>(
  options: DefineStimulusOptions<TSignals>,
): Stimulus<TSignals> {
  return {
    ...options,
    [STIMULUS_SYMBOL]: true,
    symbol: Symbol(options.name),
  };
}
