import type { ASROptions } from '@ciels/asr';
import { EventHost, toError } from '@ciels/event';

import { Sensus } from '#sensus';
import type { SensusLectioOptions, SensusOculusOptions } from '#sensus';
import { Nucleus } from '#src/nucleus/index.ts';
import type { NucleusContext, NucleusInput, NucleusOptions } from '#src/nucleus/index.ts';
import { InMemoryPerceptStore } from '#src/percepts/index.ts';
import type { Percept } from '#src/percepts/index.ts';
import type { Signal } from '#src/signals/index.ts';
import type { Stimulus } from '#src/stimulus/index.ts';

import { Identity, Soul } from './prompts.ts';

export type CielNucleusOptions<TOutput = string> = Omit<NucleusOptions<TOutput>, 'perceptStore'>;
export interface CielOptions<TOutput = string> {
  auris?: ASROptions;
  lectio?: SensusLectioOptions;
  nucleus: CielNucleusOptions<TOutput>;
  oculus?: SensusOculusOptions;
}

export interface CielEventMap<TOutput = string> {
  data(data: Percept): void;
  error(error: Error): void;
  thought(output: TOutput, input: NucleusInput): void;
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

export class Ciel<TOutput = string> extends EventHost<CielEventMap<TOutput>> {
  protected readonly Soul: string = Soul;
  protected readonly Identity: string = Identity;
  private readonly options: CielOptions<TOutput>;
  private readonly stimulus: Stimulus;
  private readonly nucleus: Nucleus<TOutput>;
  private readonly perceptStore: InMemoryPerceptStore;
  private runtime?: StimulusRuntime;
  private nucleusStarted = false;
  private state: CielState = 'idle';

  constructor(stimulus: Stimulus, options: CielOptions<TOutput>) {
    super();
    this.stimulus = stimulus;
    this.options = options;
    this.perceptStore = new InMemoryPerceptStore();
    this.perceptStore.register(stimulus);
    this.nucleus = new Nucleus({ ...options.nucleus, perceptStore: this.perceptStore }, () => [
      { name: 'SOUL', content: this.Soul },
      { name: 'IDENTITY', content: this.Identity },
    ]);
    this.nucleus.on('thought', (output, input) => this.emit('thought', output, input));
    this.nucleus.on('error', error => this.emit('error', error));
    this.nucleus.register(stimulus);
  }

  getContext(): Promise<NucleusContext> {
    return this.nucleus.getContext();
  }

  async start(): Promise<void> {
    if (this.state !== 'idle') {
      throw new Error('Ciel has already started');
    }

    this.state = 'starting';

    try {
      this.runtime = this.createRuntime(this.stimulus);
      this.subscribe(this.runtime);

      this.nucleus.start();
      this.nucleusStarted = true;
      this.runtime.started = true;
      await this.runtime.stimulus.start();

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
        auris: this.options.auris,
        lectio: this.options.lectio,
        oculus: this.options.oculus,
        signals: stimulus.signals,
      }),
      unsubscribers: [],
      started: false,
    };
  }

  private subscribe(runtime: StimulusRuntime): void {
    runtime.unsubscribers.push(
      runtime.sensus.on('data', percept => {
        this.nucleus.ingest(runtime.stimulus, percept);
        this.emit('data', percept);
      }),
      runtime.sensus.on('speechend', () => this.nucleus.speechEnd()),
      runtime.sensus.on('error', error => this.emit('error', error)),
      runtime.stimulus.on('data', signal => this.dispatch(runtime, signal)),
    );
  }

  private dispatch(runtime: StimulusRuntime, signal: Signal): Promise<void> {
    return runtime.sensus.process(signal);
  }

  private async teardown(): Promise<Error[]> {
    const errors: Error[] = [];
    // Keep subscriptions alive until the stimulus has finished stopping.
    if (this.runtime?.started) {
      try {
        await this.runtime.stimulus.stop();
      } catch (error) {
        errors.push(toError(error));
      }
    }

    if (this.nucleusStarted) {
      try {
        await this.nucleus.stop();
      } catch (error) {
        errors.push(toError(error));
      }
      this.nucleusStarted = false;
    }

    this.runtime?.unsubscribers.forEach(unsubscribe => unsubscribe());

    if (this.runtime) {
      try {
        await this.runtime.sensus.close();
      } catch (error) {
        errors.push(toError(error));
      }
    }
    this.runtime = undefined;
    errors.forEach(error => this.emit('error', error));
    return errors;
  }
}
