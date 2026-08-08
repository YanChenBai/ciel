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
}

export class Hearing {
  readonly type = 'hearing' as const;

  readonly content: string;
  readonly speaker?: string;
  readonly confidence?: number;
  readonly startAt: Date;
  readonly endAt: Date;

  constructor(options: HearingOptions) {
    this.content = options.content;
    this.startAt = options.startAt;
    this.endAt = options.endAt;
    this.speaker = options.speaker;
    this.confidence = options.confidence;
  }
}
