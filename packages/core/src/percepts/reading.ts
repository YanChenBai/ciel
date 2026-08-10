import type { Script, SignalConstructor } from '#signals';

import type { PerceptBase } from './types.ts';

export interface ReadingOptions {
  /**
   * 外部提供的符号化文字内容
   */
  content: string;

  /**
   * 文字信号产生时间
   */
  timestamp: Date;

  originSignal: SignalConstructor<Script>;
}

/**
 * Script 经感知层结构化后形成的符号感知产物
 */
export class Reading implements PerceptBase<Script> {
  readonly type = 'reading' as const;
  readonly content: string;
  readonly timestamp: Date;
  readonly originSignal: SignalConstructor<Script>;

  constructor(options: ReadingOptions) {
    this.content = options.content;
    this.timestamp = options.timestamp;
    this.originSignal = options.originSignal;
  }
}
