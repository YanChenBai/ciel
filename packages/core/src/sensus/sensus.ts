import { EventHost, toError } from '@ciels/event';

import type { Percept } from '#percepts';
import { Echo, Photon, Script } from '#signals';
import type { Signal, SignalConstructor } from '#signals';
import { VigiliaChannel } from '#vigilia';

import { Auris } from './auris.ts';
import type { SensusBase } from './base.ts';
import { Lectio } from './lectio.ts';
import { Oculus } from './oculus/index.ts';
import { SensusOperations } from './operations.ts';
import type { SensusOptions, SensusOutputEventMap } from './types.ts';

type SignalHandler = (signal: Signal) => void | Promise<void>;
type SensusCleanup = () => void | Promise<void>;

/**
 * 为一组具体信号统一装配感官能力、输出事件与生命周期
 */
export class Sensus extends EventHost<SensusOutputEventMap> {
  readonly observations = new VigiliaChannel();
  private readonly handlers = new Map<SignalConstructor, SignalHandler>();
  private readonly cleanups: SensusCleanup[] = [];
  private readonly operations = new SensusOperations(this.observations);

  constructor(private readonly options: SensusOptions) {
    super();

    // 先完整校验，避免构造失败时遗留只初始化了一部分的感官能力。
    const declared = new Set<SignalConstructor>();
    for (const Signal of options.signals) {
      if (declared.has(Signal)) {
        throw new Error(`${Signal.name} is declared more than once`);
      }
      if (!Echo.is(Signal) && !Photon.is(Signal) && !Script.is(Signal)) {
        throw new Error(`No sensory capability registered for signal ${Signal.name}`);
      }
      declared.add(Signal);
    }

    for (const Signal of options.signals) {
      this.register(Signal);
    }
  }

  /**
   * 处理一个已声明信号，并等待对应能力完成同步或异步工作
   */
  async process(signal: Signal): Promise<void> {
    const Signal = signal.constructor as SignalConstructor;
    const handler = this.handlers.get(Signal);

    try {
      await this.operations.process(signal, async () => {
        if (!handler) throw new Error(`${Signal.name} is not declared in Sensus signals`);
        await handler(signal);
      });
    } catch (error) {
      const normalized = toError(error);
      this.operations.failAsr(normalized);
      this.observations.emit('error.observed', {
        error: normalized,
        phase: 'process',
        source: 'sensus',
      });
      this.emit('error', normalized);
    }
  }

  async close(): Promise<void> {
    const errors: Error[] = [];

    for (const cleanup of this.cleanups) {
      try {
        await cleanup();
      } catch (error) {
        errors.push(toError(error));
      }
    }

    this.operations.cancelAsr();

    this.cleanups.length = 0;
    this.handlers.clear();
    this.clearAllEvents();

    if (errors.length > 0) {
      throw new AggregateError(errors, 'Failed to close Sensus cleanly');
    }
  }

  private register(Signal: SignalConstructor): void {
    if (Echo.is(Signal)) {
      this.bind(Signal, new Auris(Signal, this.options.auris));
      return;
    }

    if (Photon.is(Signal)) {
      this.bind(Signal, new Oculus(Signal, this.options.oculus));
      return;
    }

    if (Script.is(Signal)) {
      this.bind(Signal, new Lectio(Signal, this.options.lectio));
      return;
    }

    throw new Error(`No sensory capability registered for signal ${Signal.name}`);
  }

  private bind<TSignal extends Signal, TPercept extends Percept>(
    signal: SignalConstructor<TSignal>,
    capability: SensusBase<TSignal, TPercept>,
  ): void {
    capability.on('data', percept => this.emit('data', percept));
    capability.on('error', error => {
      this.operations.failAsr(error);
      this.observations.emit('error.observed', {
        error,
        phase: 'capability',
        source: 'sensus',
      });
      this.emit('error', error);
    });
    capability.on('speechstart', at => {
      this.operations.startAsr(at);
      this.emit('speechstart', at);
    });
    capability.on('speechend', at => {
      this.operations.completeAsr(at);
      this.emit('speechend', at);
    });

    this.handlers.set(signal, value => capability.process(value as TSignal));
    this.cleanups.push(() => capability.close());
  }
}
