import { Reading } from '#percepts';
import type { Script } from '#signals';

import { SensusBase } from './base.ts';
import type { LectioOptions } from './types.ts';

export type { LectioEventMap, LectioOptions } from './types.ts';

/**
 * 接收 Script 并将其对齐为 Reading 的阅读感官
 */
export class Lectio extends SensusBase<Script, Reading> {
  constructor(signal: typeof Script, _options: LectioOptions = {}) {
    super(signal);
  }

  process(script: Script): void {
    try {
      this.assertSignal(script);
      this.emitData(
        new Reading({
          content: script.content,
          timestamp: script.timestamp,
          originSignal: this.signal,
        }),
      );
    } catch (error) {
      this.emitError(error);
    }
  }
}
