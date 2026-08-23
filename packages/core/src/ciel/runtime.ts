import type { Percept } from '#percepts';
import { Sensus } from '#sensus';
import type { Stimulus } from '#stimulus';
import type { VigiliaSource } from '#vigilia';

import type { CielOptions } from './types.ts';

interface CielRuntimeEvents {
  readonly data: (percept: Percept) => void;
  readonly error: (error: Error) => void;
  readonly speechEnd: (at: Date) => void;
}

interface CielRuntimeOptions {
  readonly events: CielRuntimeEvents;
  readonly sensus: Pick<CielOptions, 'auris' | 'lectio' | 'oculus'>;
  readonly stimulus: Stimulus;
}

/** 管理单个 Stimulus 对应的 Sensus 和临时事件订阅。 */
export class CielRuntime {
  readonly observations: VigiliaSource;
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
    this.observations = this.sensus.observations;
    this.unsubscribers = [
      this.sensus.on('data', options.events.data),
      this.sensus.on('speechend', at => {
        // Nucleus 只消费语音结束语义；ASR operation 已由 Sensus 自己结算。
        options.events.speechEnd(at);
      }),
      this.sensus.on('error', options.events.error),
      this.stimulus.on('data', signal => this.sensus.process(signal)),
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
