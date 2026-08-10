import { EventHost } from '@ciels/event';

import type { Signal, SignalConstructor } from '#signals';
import { WithMeta } from '#utils';

export interface StimulusEventMap<TSignal extends Signal = Signal> {
  data(data: TSignal): void;
}

export interface StimulusMeta {
  /**
   * 刺激源在上下文中的语义名称
   */
  name: string;

  /**
   * 刺激源在上下文中的语义描述
   */
  description: string;
}

export type StimulusSignal<TSignals extends readonly SignalConstructor[]> = InstanceType<
  TSignals[number]
>;

export type StimulusConstructor<TStimulus extends Stimulus = Stimulus> = (abstract new (
  ...args: any[]
) => TStimulus) & {
  readonly meta: StimulusMeta;
  assertMeta(): void;
};

/**
 * 外部场景的刺激源。一个 Stimulus 声明它可能产生的信号，并负责自身生命周期。
 */
export abstract class Stimulus<
  TSignals extends readonly SignalConstructor[] = readonly SignalConstructor[],
> extends EventHost<StimulusEventMap<StimulusSignal<TSignals>>> {
  static meta: StimulusMeta;

  /** 该刺激源允许发送的具体信号类型。 */
  abstract readonly signals: TSignals;
  abstract start(): void | Promise<void>;
  abstract stop(): void | Promise<void>;

  /**
   * 校验具体刺激源提供了可用于上下文的语义信息。
   */
  static assertMeta(): void {
    if (!this.meta?.name || !this.meta.description) {
      throw new Error(`${this.name} must define non-empty context meta`);
    }
  }

  protected async send(signal: StimulusSignal<TSignals>): Promise<void> {
    const value = signal as Signal;
    const Signal = value.constructor as SignalConstructor;
    if (!this.signals.includes(Signal)) {
      throw new Error(`${Signal.name} is not declared in stimulus.signals`);
    }

    // Signal 自带类型判别字段，聚合流的消费者可以直接按类型路由。
    await this.emitAsync('data', signal);
  }

  static WithMeta<const TMeta extends StimulusMeta>(meta: TMeta) {
    return WithMeta(Stimulus, meta);
  }
}
