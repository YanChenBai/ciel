import type { ASROptions } from '@ciels/asr';
import { EventHost, toError } from '@ciels/event';

import { Sensus } from '#sensus';
import type { SensusLectioOptions, SensusOculusOptions } from '#sensus';
import { Nucleus } from '#src/nucleus/index.ts';
import type { NucleusContext, NucleusInput, NucleusOptions } from '#src/nucleus/index.ts';
import type { Percept } from '#src/percepts/index.ts';
import type { Signal } from '#src/signals/index.ts';
import type { Stimulus } from '#src/stimulus/index.ts';
import { Vestigium } from '#src/vestigium/index.ts';
import type { VestigiumStore } from '#src/vestigium/index.ts';

export type CielNucleusOptions<TOutput = string> = NucleusOptions<TOutput>;

export interface CielOptions<TOutput = string> {
  auris?: ASROptions;
  lectio?: SensusLectioOptions;
  nucleus?: CielNucleusOptions<TOutput>;
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
  protected readonly Soul: string =
    '你是夏尔。保持理性、温和与好奇，区分事实与推测，只在行动有价值时主动介入。';

  protected readonly IDENTITY: string = [
    '名字：夏尔',
    '形象：暂无固定形象',
    '身份：Ciel 的认知主体',
  ].join('\n');

  private readonly options: CielOptions<TOutput>;
  private readonly stimuli: Stimulus[] = [];
  private readonly nucleus?: Nucleus<TOutput>;
  private readonly vestigium: VestigiumStore;
  private runtimes: StimulusRuntime[] = [];
  private nucleusStarted = false;
  private state: CielState = 'idle';

  constructor(options: CielOptions<TOutput> = {}) {
    super();
    this.options = options;
    this.vestigium = options.nucleus?.vestigium ?? new Vestigium();
    if (options.nucleus) {
      this.nucleus = new Nucleus({ ...options.nucleus, vestigium: this.vestigium }, () => [
        { name: 'SOUL', content: this.Soul },
        { name: 'IDENTITY', content: this.IDENTITY },
      ]);
      this.nucleus.on('thought', (output, input) => this.emit('thought', output, input));
      this.nucleus.on('error', error => this.emit('error', error));
    }
  }

  use(stimulus: Stimulus): this {
    if (this.state !== 'idle') {
      throw new Error('Cannot add a stimulus while Ciel is active');
    }

    if (this.stimuli.includes(stimulus)) {
      throw new Error('Stimulus is already registered');
    }

    this.stimuli.push(stimulus);
    this.vestigium.register(stimulus);
    this.nucleus?.register(stimulus);

    return this;
  }

  getContext(): Promise<NucleusContext> {
    return this.getNucleus().getContext();
  }

  getNucleus(): Nucleus<TOutput> {
    if (!this.nucleus) {
      throw new Error('Ciel has no Nucleus configuration');
    }
    return this.nucleus;
  }

  getVestigium(): VestigiumStore {
    return this.vestigium;
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

      this.nucleus?.start();
      this.nucleusStarted = this.nucleus !== undefined;
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
        if (this.nucleus) {
          this.nucleus.ingest(runtime.stimulus, percept);
        } else {
          this.vestigium.append(runtime.stimulus, percept);
        }
        this.emit('data', percept);
      }),
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

    if (this.nucleusStarted && this.nucleus) {
      try {
        await this.nucleus.stop();
      } catch (error) {
        errors.push(toError(error));
      }
      this.nucleusStarted = false;
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
