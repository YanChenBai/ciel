import type { ASROptions } from '@ciels/asr';
import { EventHost, toError } from '@ciels/event';

import { Sensus } from '#sensus';
import type { SensusLectioOptions, SensusOculusOptions } from '#sensus';
import type { Percept } from '#src/percepts/index.ts';
import type { Signal } from '#src/signals/index.ts';
import type { Stimulus } from '#src/stimulus/index.ts';

export interface CielOptions {
  auris?: ASROptions;
  lectio?: SensusLectioOptions;
  oculus?: SensusOculusOptions;
}

export interface CielEventMap {
  data(data: Percept): void;
  error(error: Error): void;
}

interface StimulusRuntime {
  /**
   * 该运行时管理的刺激源实例
   */
  stimulus: Stimulus;

  sensus: Sensus;

  /**
   * Stimulus 到 Ciel 的事件订阅清理函数
   */
  unsubscribers: (() => void)[];

  /**
   * 刺激源是否已成功进入启动流程
   */
  started: boolean;
}

type CielState = 'idle' | 'starting' | 'running' | 'stopping';

export class Ciel extends EventHost<CielEventMap> {
  private readonly options: CielOptions;
  private readonly stimuli: Stimulus[] = [];
  private runtimes: StimulusRuntime[] = [];
  private state: CielState = 'idle';

  constructor(options: CielOptions = {}) {
    super();
    this.options = options;
  }

  use(stimulus: Stimulus): this {
    if (this.state !== 'idle') {
      throw new Error('Cannot add a stimulus while Ciel is active');
    }

    if (this.stimuli.includes(stimulus)) {
      throw new Error('Stimulus is already registered');
    }

    this.stimuli.push(stimulus);

    return this;
  }

  async start(): Promise<void> {
    if (this.state !== 'idle') {
      throw new Error('Ciel has already started');
    }

    this.state = 'starting';

    try {
      this.runtimes = [];

      for (const stimulus of this.stimuli) {
        this.runtimes.push(this.createRuntime(stimulus));
      }
      this.runtimes.forEach(runtime => this.subscribe(runtime));

      for (const runtime of this.runtimes) {
        runtime.started = true;
        await runtime.stimulus.start();
      }

      this.state = 'running';
    } catch (error) {
      await this.teardown();
      this.state = 'idle';
      throw error;
    }
  }

  async stop(): Promise<void> {
    if (this.state !== 'running') {
      throw new Error('Ciel is not running');
    }
    this.state = 'stopping';
    const errors = await this.teardown();
    this.state = 'idle';
    if (errors.length > 0) {
      throw new AggregateError(errors, 'Failed to stop Ciel cleanly');
    }
  }

  private createRuntime(stimulus: Stimulus): StimulusRuntime {
    return {
      stimulus,
      sensus: new Sensus({
        ...this.options,
        signals: stimulus.signals,
      }),
      unsubscribers: [],
      started: false,
    };
  }

  private subscribe(runtime: StimulusRuntime): void {
    runtime.unsubscribers.push(
      runtime.sensus.on('data', percept => this.emit('data', percept)),
      runtime.sensus.on('error', error => this.emit('error', error)),
      runtime.stimulus.on('data', signal => this.dispatch(runtime, signal)),
    );
  }

  private dispatch(runtime: StimulusRuntime, signal: Signal): Promise<void> {
    return runtime.sensus.process(signal);
  }

  private async teardown(): Promise<Error[]> {
    const errors: Error[] = [];
    // Keep subscriptions alive until each stimulus has finished stopping.
    for (const runtime of [...this.runtimes].reverse()) {
      if (!runtime.started) {
        continue;
      }
      try {
        await runtime.stimulus.stop();
      } catch (error) {
        errors.push(toError(error));
      }
    }

    this.runtimes.forEach(runtime => {
      runtime.unsubscribers.forEach(unsubscribe => unsubscribe());
    });

    for (const runtime of this.runtimes) {
      try {
        await runtime.sensus.close();
      } catch (error) {
        errors.push(toError(error));
      }
    }
    this.runtimes = [];
    errors.forEach(error => this.emit('error', error));
    return errors;
  }
}
