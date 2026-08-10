import type { Echo } from './echo.ts';
import type { Photon } from './photon.ts';
import type { Script } from './script.ts';

export interface SignalMeta {
  /**
   * 信号在上下文中的语义名称
   */
  name: string;

  /**
   * 信号在上下文中的语义描述
   */
  description: string;
}

/**
 * Ciel 支持的原始信号
 */
export type Signal = Echo | Photon | Script;

/**
 * 带有静态元数据的具体信号构造器
 */
export type SignalConstructor<TSignal extends Signal = Signal> = (abstract new (
  ...args: any[]
) => TSignal) & {
  readonly meta: SignalMeta;
  assertMeta(): void;
};
