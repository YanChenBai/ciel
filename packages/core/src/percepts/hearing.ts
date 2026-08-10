import type { Echo, SignalConstructor } from '#signals';

import type { PerceptBase } from './types.ts';

export interface HearingToken {
  content: string;
  startAt: Date;
  endAt: Date;
}

export interface HearingOptions {
  /**
   * ASR 转写文本
   */
  content: string;

  /**
   * 声纹识别出的说话人
   */
  speaker?: string;

  /**
   * ASR / Speaker Recognition 置信度
   */
  confidence?: number;

  /**
   * 音频片段开始时间
   */
  startAt: Date;

  /**
   * 音频片段结束时间
   */
  endAt: Date;

  /**
   * Token 级转写时间戳
   */
  tokens?: readonly HearingToken[];

  originSignal: SignalConstructor<Echo>;
}

export class Hearing implements PerceptBase<Echo> {
  /**
   * 感知结果类型
   */
  readonly type = 'hearing' as const;

  /**
   * ASR 转写文本
   */
  readonly content: string;

  /**
   * 声纹识别出的说话人
   */
  readonly speaker?: string;

  /**
   * ASR / Speaker Recognition 置信度
   */
  readonly confidence?: number;

  /**
   * 音频片段开始时间
   */
  readonly startAt: Date;

  /**
   * 音频片段结束时间
   */
  readonly endAt: Date;

  /**
   * Token 级转写时间戳
   */
  readonly tokens?: readonly HearingToken[];

  readonly originSignal: SignalConstructor<Echo>;

  constructor(options: HearingOptions) {
    this.content = options.content;
    this.startAt = options.startAt;
    this.endAt = options.endAt;
    this.speaker = options.speaker;
    this.confidence = options.confidence;
    this.tokens = options.tokens;
    this.originSignal = options.originSignal;
  }
}
