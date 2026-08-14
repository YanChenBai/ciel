import type { ASROptions } from '@ciels/asr';

import type { Hearing, Percept, Reading } from '#percepts';
import type { SignalConstructor } from '#signals';

import type { OculusOptions } from './oculus/types.ts';

export interface SensusEventMap<TData> {
  data(data: TData): void;
  error(error: Error): void;
  /** VAD 检测到一段语音开始。 */
  speechstart(at: Date): void;
  /** 仅听觉能力在 VAD 完成一段语音后触发。 */
  speechend(at: Date): void;
}

export type AurisEventMap = SensusEventMap<Hearing>;
export type LectioEventMap = SensusEventMap<Reading>;

export type AurisOptions = ASROptions;

export type LectioOptions = Record<PropertyKey, never>;

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
  /** VAD 检测到一段语音开始。 */
  speechstart(at: Date): void;
  /** VAD 完成一段语音；此时对应 Hearing 已先发送。 */
  speechend(at: Date): void;
}
