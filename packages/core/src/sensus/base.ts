import { EventHost, toError } from '@ciels/event';

import type { Signal, SignalConstructor } from '#signals';

import type { SensusEventMap } from './types.ts';

/**
 * 单项感官能力的信号绑定、事件与生命周期契约
 */
export abstract class SensusBase<TSignal extends Signal, TData> extends EventHost<
  SensusEventMap<TData>
> {
  protected readonly signal: SignalConstructor<TSignal>;

  protected constructor(signal: SignalConstructor<TSignal>) {
    super();
    if (!signal.meta?.name || !signal.meta.description) {
      throw new Error(
        `${new.target.name} signal must be created from ${signal.name}.WithMeta(...)`,
      );
    }
    this.signal = signal;
  }

  /**
   * 接收一个绑定类型的信号；具体能力可以同步或异步完成处理
   */
  abstract process(signal: TSignal): void | Promise<void>;

  /**
   * 释放能力持有的资源；子类可扩展为异步清理
   */
  close(): void | Promise<void> {
    this.clearAllEvents();
  }

  protected assertSignal(signal: TSignal): void {
    if (!(signal instanceof this.signal)) {
      throw new Error(
        `${this.constructor.name} can only process instances of its bound signal ${this.signal.name}`,
      );
    }
  }

  protected emitData(data: TData): void {
    this.emit('data', data);
  }

  protected emitError(error: unknown): void {
    this.emit('error', toError(error));
  }
}
