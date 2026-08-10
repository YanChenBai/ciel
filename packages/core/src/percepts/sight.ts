import type { Photon, SignalConstructor } from '#signals';

import type { PerceptBase } from './types.ts';

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

  originSignal: SignalConstructor<Photon>;
}

export class Sight implements PerceptBase<Photon> {
  /**
   * 感知结果类型
   */
  readonly type = 'sight' as const;

  /**
   * 持久化后的图片路径
   */
  readonly path: string;

  /**
   * 这组帧开始时间
   */
  readonly startAt: Date;

  /**
   * 这组帧结束时间
   */
  readonly endAt: Date;

  readonly originSignal: SignalConstructor<Photon>;

  constructor(options: SightOptions) {
    this.path = options.path;
    this.startAt = options.startAt;
    this.endAt = options.endAt;
    this.originSignal = options.originSignal;
  }
}
