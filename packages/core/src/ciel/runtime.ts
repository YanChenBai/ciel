import { Sensus } from '#sensus';
import type { Percept } from '#src/percepts/index.ts';
import type { Signal } from '#src/signals/index.ts';
import type { Stimulus } from '#src/stimulus/index.ts';

import type { CielOptions } from './types.ts';

interface CielRuntimeEvents {
  readonly data: (percept: Percept) => void;
  readonly error: (error: Error) => void;
  readonly processSignal: (signal: Signal, process: () => Promise<void>) => Promise<void>;
  readonly speechEnd: (at: Date) => void;
  readonly speechStart: (at: Date) => void;
}

interface CielRuntimeOptions {
  readonly events: CielRuntimeEvents;
  readonly sensus: Pick<CielOptions, 'auris' | 'lectio' | 'oculus'>;
  readonly stimulus: Stimulus;
}

/** 管理单个 Stimulus 对应的 Sensus 和临时事件订阅。 */
export class CielRuntime {
  readonly stimulus: Stimulus;
  private readonly sensus: Sensus;
  private readonly unsubscribers: (() => void)[];
  private sourceStarted = false;

  constructor(options: CielRuntimeOptions) {
    this.stimulus = options.stimulus;
    this.sensus = new Sensus({
      auris: options.sensus.auris,
      lectio: options.sensus.lectio,
      oculus: options.sensus.oculus,
      signals: options.stimulus.signals,
    });
    this.unsubscribers = [
      this.sensus.on('data', options.events.data),
      this.sensus.on('speechstart', options.events.speechStart),
      this.sensus.on('speechend', at => {
        // Nucleus 调度与 ASR 观测必须看到同一个 speechend，并保持原有调用顺序。
        options.events.speechEnd(at);
      }),
      this.sensus.on('error', options.events.error),
      this.stimulus.on('data', signal =>
        options.events.processSignal(signal, () => this.sensus.process(signal)),
      ),
    ];
  }

  async startSource(): Promise<void> {
    this.sourceStarted = true;
    await this.stimulus.start();
  }

  async stopSource(): Promise<void> {
    if (!this.sourceStarted) return;
    try {
      await this.stimulus.stop();
    } finally {
      this.sourceStarted = false;
    }
  }

  async close(): Promise<void> {
    // 关闭 Sensus 前解除转发，避免 close() 的内部刷新在 Ciel 停止后继续进入 Nucleus。
    for (const unsubscribe of this.unsubscribers) unsubscribe();
    this.unsubscribers.length = 0;
    await this.sensus.close();
  }
}
