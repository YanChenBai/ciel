import type { ASROptions } from '@ciels/asr';

import type { Hearing, Percept, Reading, Sight } from '#percepts';
import type { SignalConstructor } from '#signals';

export interface SensusEventMap<TData> {
  data(data: TData): void;
  error(error: Error): void;
}

export type AurisEventMap = SensusEventMap<Hearing>;
export type LectioEventMap = SensusEventMap<Reading>;
export type OculusEventMap = SensusEventMap<Sight>;

export type AurisOptions = ASROptions;

export type LectioOptions = Record<PropertyKey, never>;

export interface OculusOptions {
  sampleInterval?: number;
  /** 与上一张已保留帧的平均像素差异达到该比例时才进入拼图，范围 0-1。 */
  differenceThreshold?: number;
  outputDir?: string;
}

export type SensusOculusOptions = OculusOptions;
export type SensusLectioOptions = LectioOptions;

export interface SensusOptions {
  signals: readonly SignalConstructor[];
  auris?: AurisOptions;
  lectio?: LectioOptions;
  oculus?: OculusOptions;
}

export interface SensusOutputEventMap {
  data(data: Percept): void;
  error(error: Error): void;
}
