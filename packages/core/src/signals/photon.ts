import { WithMeta } from '#utils';

import { SignalBase } from './base.ts';
import type { SignalMeta } from './types.ts';

export interface PhotonFrame {
  /**
   * 原始图像数据
   */
  data: Buffer;

  /**
   * 图像帧采集时间
   */
  timestamp: Date;
}

export abstract class Photon extends SignalBase {
  /**
   * 信号类型
   */
  readonly type = 'photon' as const;

  /**
   * 原始图像数据
   */
  readonly data: Buffer;

  /**
   * 图像帧采集时间
   */
  readonly timestamp: Date;

  /**
   * 构造该信号所使用的完整图像帧
   */
  readonly frame: PhotonFrame;

  /**
   * 创建视觉信号
   */
  constructor(frame: PhotonFrame) {
    super();
    this.frame = frame;
    this.data = frame.data;
    this.timestamp = frame.timestamp;
  }

  /**
   * 创建携带静态元数据的 Photon 基类
   */
  static WithMeta<const TMeta extends SignalMeta>(meta: TMeta) {
    return WithMeta(Photon, meta);
  }
}
