import { WithMeta } from '#utils';

import { SignalBase } from './base.ts';
import type { SignalMeta } from './types.ts';

export interface EchoSegment {
  /**
   * 原始音频数据
   */
  data: Buffer;

  /**
   * 音频片段开始时间
   */
  startAt: Date;

  /**
   * 音频片段结束时间
   */
  endAt: Date;
}

export abstract class Echo extends SignalBase {
  /**
   * 信号类型
   */
  readonly type = 'echo' as const;

  /**
   * 原始音频数据
   */
  readonly data: Buffer;

  /**
   * 音频片段开始时间
   */
  readonly startAt: Date;

  /**
   * 音频片段结束时间
   */
  readonly endAt: Date;

  /**
   * 构造该信号所使用的完整音频片段
   */
  readonly segment: EchoSegment;

  /**
   * 创建音频信号
   */
  constructor(segment: EchoSegment) {
    super();
    this.segment = segment;
    this.data = segment.data;
    this.startAt = segment.startAt;
    this.endAt = segment.endAt;
  }

  /**
   * 创建携带静态元数据的 Echo 基类
   */
  static WithMeta<const TMeta extends SignalMeta>(meta: TMeta) {
    return WithMeta(Echo, meta);
  }
}
