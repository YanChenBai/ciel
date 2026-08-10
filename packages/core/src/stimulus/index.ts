import { EventHost } from '@ciels/event';

import type { Echo, Photon, Script, Signal, SignalConstructor } from '#signals';
import { WithMeta } from '#src/utils/index.ts';

export interface StimulusEventMap {
  photon(data: Photon): void;
  echo(data: Echo): void;
  script(data: Script): void;
}

export interface StimulusMeta {
  title: string;
  description: string;
}

export type StimulusSignal<TSignals extends readonly SignalConstructor[]> = InstanceType<
  TSignals[number]
>;

export abstract class Stimulus<
  TSignals extends readonly SignalConstructor[] = readonly SignalConstructor[],
> extends EventHost<StimulusEventMap> {
  static meta: StimulusMeta;
  /** Concrete signal classes this stimulus is allowed to send. */
  abstract readonly signals: TSignals;
  abstract start(): void | Promise<void>;
  abstract stop(): void | Promise<void>;

  protected async send(signal: StimulusSignal<TSignals>): Promise<void> {
    const value = signal as Signal;
    const Signal = value.constructor as SignalConstructor;
    if (!this.signals.includes(Signal)) {
      throw new Error(Signal.name + ' is not declared in stimulus.signals');
    }

    // Async emission gives Ciel backpressure while retaining the typed event map.
    switch (value.type) {
      case 'echo':
        await this.emitAsync('echo', value);
        break;
      case 'photon':
        await this.emitAsync('photon', value);
        break;
      case 'script':
        await this.emitAsync('script', value);
        break;
    }
  }

  static WithMeta<const TMeta extends StimulusMeta>(meta: TMeta) {
    return WithMeta(Stimulus, meta);
  }
}
