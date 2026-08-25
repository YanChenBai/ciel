import { CIEL_SYMBOL } from '../identity.ts';
import type { Percept } from '../percept/index.ts';
import type { Sensu } from '../sensu/index.ts';
import type { Stimulus } from '../stimulus/index.ts';
import type { LifecycleStatus } from './lifecycle.ts';

export type AnyStimulus = Stimulus<any>;

export type AnySensu = Sensu<any>;

export type SignalsOfStimuli<TStimuli extends readonly AnyStimulus[]> = {
  readonly [TIndex in keyof TStimuli]: TStimuli[TIndex] extends Stimulus<infer TSignals>
    ? TSignals
    : never;
};

export type SensuResolver<
  TStimuli extends readonly AnyStimulus[],
  TSensus extends readonly AnySensu[],
> = (signals: SignalsOfStimuli<TStimuli>) => TSensus;

export interface DefineCielOptions<
  TStimuli extends readonly AnyStimulus[],
  TSensus extends readonly AnySensu[],
  TNucleus = unknown,
> {
  readonly stimulus: TStimuli;

  readonly sensus: SensuResolver<TStimuli, TSensus>;

  readonly nucleus?: TNucleus;
}

export type CielStatus = LifecycleStatus;

export interface Ciel<TNucleus = unknown> {
  readonly [CIEL_SYMBOL]: true;

  readonly nucleus: TNucleus | undefined;

  readonly percepts: readonly Percept[];

  readonly status: CielStatus;

  start(): Promise<void>;

  stop(): Promise<void>;
}
