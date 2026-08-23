import type { ASROptions } from '@ciels/asr';

import type { SensusLectioOptions, SensusOculusOptions } from '#sensus';
import type { ContextInput } from '#src/context/index.ts';
import type { NucleusOptions } from '#src/nucleus/index.ts';
import type { Percept } from '#src/percepts/index.ts';
import type { Vigilia, VigiliaOptions } from '#src/vigilia/index.ts';

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
