import type { SignalConstructor } from '../signals/types.ts';

export interface SightOptions {
  /**
   * 持久化后的图片路径
   */
  path: string;

  /**
   * 这组帧开始时间
   */
  startAt: Date;

  /**
   * 这组帧结束时间
   */
  endAt: Date;

  signal: SignalConstructor;
}

export class Sight {
  readonly type = 'sight' as const;

  readonly path: string;
  readonly startAt: Date;
  readonly endAt: Date;
  readonly signal: SignalConstructor;

  constructor(options: SightOptions) {
    this.path = options.path;
    this.startAt = options.startAt;
    this.endAt = options.endAt;
    this.signal = options.signal;
  }
}
