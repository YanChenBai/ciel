import type { SignalMeta } from './types.ts';
import type { SignalConstructor } from './types.ts';

/**
 * 所有原始信号的公共静态契约
 */
export abstract class SignalBase {
  /**
   * 信号类型的名称与用途描述
   */
  static readonly meta: SignalMeta;

  /**
   * 判断构造器是否属于当前信号基类，并保留静态 this 的精确类型收窄
   */
  static is<TSignalBase extends SignalConstructor>(
    this: TSignalBase,
    Signal: SignalConstructor,
  ): Signal is TSignalBase {
    return Signal === this || Signal.prototype instanceof this;
  }
}
