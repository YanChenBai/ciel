import { WithMeta } from '#utils';

import { SignalBase } from './base.ts';
import type { SignalMeta } from './types.ts';

export interface ScriptData {
  /**
   * 外部提供的符号化文字内容
   */
  content: string;

  /**
   * 文字信号产生时间
   */
  timestamp: Date;
}

export abstract class Script extends SignalBase {
  /**
   * 信号类型
   */
  readonly type = 'script' as const;

  /**
   * 外部提供的符号化文字内容
   */
  readonly content: string;

  /**
   * 文字信号产生时间
   */
  readonly timestamp: Date;

  /**
   * 创建文字信号
   */
  constructor(data: ScriptData) {
    super();

    this.content = data.content;
    this.timestamp = data.timestamp;
  }

  /**
   * 创建携带静态元数据的 Script 基类
   */
  static WithMeta<const TMeta extends SignalMeta>(meta: TMeta) {
    return WithMeta(Script, meta);
  }
}
