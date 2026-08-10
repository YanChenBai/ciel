import type { Signal, SignalConstructor } from '#signals';

import type { Hearing } from './hearing.ts';
import type { Reading } from './reading.ts';
import type { Sight } from './sight.ts';

export type Percept = Hearing | Reading | Sight;

export interface PerceptBase<TSignal extends Signal> {
  /**
   * 形成该感知产物的原始信号类型
   */
  readonly originSignal: SignalConstructor<TSignal>;
}
