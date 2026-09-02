import type { Instrument } from '@cieljs/instrument';

import type { AnyCue } from '#model/cue/index.ts';
import type { EngramEntry } from '#model/engram/index.ts';
import type { Percept } from '#model/percept/index.ts';
import type { AnySignal, AnySignalDefinition, SignalOf } from '#model/signal/index.ts';
import type { MaybePromise } from '#shared/async.ts';
import type { CielMetadata } from '#shared/metadata.ts';

export interface SensuResult {
  readonly percepts?: Percept | readonly Percept[];
  readonly cues?: AnyCue | readonly AnyCue[];
}

export interface SensuOutputReceipt {
  readonly entries: readonly EngramEntry[];
  readonly cueCount: number;
}

export interface SensuOutput {
  write(result: SensuResult): Promise<SensuOutputReceipt>;
}

export interface SensuCreateContext {
  readonly instrument: Instrument;
  readonly output: SensuOutput;
}

export interface SensuProcessor<TSignal extends AnySignal = AnySignal> {
  write(signal: TSignal): MaybePromise<void>;
  close(): MaybePromise<void>;
}

export interface DefineSensuOptions<TDefinition extends AnySignalDefinition> extends CielMetadata {
  readonly signal: TDefinition;
  create(
    this: void,
    context: SensuCreateContext,
  ): MaybePromise<SensuProcessor<SignalOf<TDefinition>>>;
}

export interface Sensu<
  TDefinition extends AnySignalDefinition = AnySignalDefinition,
> extends CielMetadata {
  readonly id: string;
  readonly signal: TDefinition;
  create(
    this: void,
    context: SensuCreateContext,
  ): MaybePromise<SensuProcessor<SignalOf<TDefinition>>>;
}

export type SensuFactory<TOptions, TDefinition extends AnySignalDefinition> = (
  options: TOptions,
) => Sensu<TDefinition>;
export type EmptySensuFactory<TDefinition extends AnySignalDefinition> = () => Sensu<TDefinition>;
