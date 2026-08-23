import type { ASROptions } from '@ciels/asr';

import type { ContextInput } from '#context';
import type { NucleusOptions } from '#nucleus';
import type { Percept } from '#percepts';
import type { SensusLectioOptions, SensusOculusOptions } from '#sensus';
import type { Vigilia, VigiliaOptions } from '#vigilia';

export type CielNucleusOptions<TOutput = string> = Omit<NucleusOptions<TOutput>, 'perceptStore'>;

export interface CielOptions<TOutput = string> {
  auris?: ASROptions;
  lectio?: SensusLectioOptions;
  nucleus: CielNucleusOptions<TOutput>;
  oculus?: SensusOculusOptions;
  vigilia?: Vigilia | VigiliaOptions;
}

export interface CielEventMap<TOutput = string> {
  data(data: Percept): void;
  error(error: Error): void;
  thought(output: TOutput, input: ContextInput): void;
}

export type CielState = 'idle' | 'running' | 'starting' | 'stopping';
