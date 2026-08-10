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

export abstract class Stimulus<
  TSignals extends readonly SignalConstructor[] = readonly SignalConstructor[],
> extends EventHost<StimulusEventMap<StimulusSignal<TSignals>>> {
  static meta: StimulusMeta;

  /** Concrete signal classes this stimulus is allowed to send. */
  abstract readonly signals: TSignals;
  abstract start(): void | Promise<void>;
  abstract stop(): void | Promise<void>;

  protected async send(signal: StimulusSignal<TSignals>): Promise<void> {
    const value = signal as Signal;
    const Signal = value.constructor as SignalConstructor;
    if (!this.signals.includes(Signal)) {
      throw new Error(`${Signal.name} is not declared in stimulus.signals`);
    }

    // Signal carries its own discriminant; consumers can route the aggregated stream by type.
    await this.emitAsync('data', signal);
  }

  static WithMeta<const TMeta extends StimulusMeta>(meta: TMeta) {
    return WithMeta(Stimulus, meta);
  }
}
