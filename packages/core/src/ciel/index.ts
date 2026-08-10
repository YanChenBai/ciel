import type { ASROptions } from '@ciels/asr';
import { EventHost, toError } from '@ciels/event';

import { Sensus } from '#sensus';
import type { SensusLectioOptions, SensusOculusOptions } from '#sensus';
import { ContextCollection } from '#src/context/collection.ts';
import { Context } from '#src/context/index.ts';
import type { ContextOptions } from '#src/context/index.ts';
import { Nucleus } from '#src/nucleus/index.ts';
import type { NucleusInput, NucleusOptions } from '#src/nucleus/index.ts';
import type { Percept } from '#src/percepts/index.ts';
import type { Signal } from '#src/signals/index.ts';
import type { Stimulus } from '#src/stimulus/index.ts';

export type CielNucleusOptions<TOutput = string> = Omit<NucleusOptions<TOutput>, 'context'>;

export interface CielOptions<TOutput = string> {
  auris?: ASROptions;
  context?: ContextOptions;
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

  context: Context;

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
  private readonly options: CielOptions<TOutput>;
  private readonly stimuli: Stimulus[] = [];
  private readonly contexts = new Map<Stimulus, Context>();
  private readonly contextCollection = new ContextCollection();
  private readonly nucleus?: Nucleus<TOutput>;
  private runtimes: StimulusRuntime[] = [];
  private nucleusStarted = false;
  private state: CielState = 'idle';

  constructor(options: CielOptions<TOutput> = {}) {
    super();
    this.options = options;
    if (options.nucleus) {
      this.nucleus = new Nucleus({ context: this.contextCollection, ...options.nucleus });
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
    const context = new Context(stimulus, this.options.context);
    this.contexts.set(stimulus, context);
    this.contextCollection.add(context);

    return this;
  }

  getContext(stimulus: Stimulus): Context {
    const context = this.contexts.get(stimulus);
    if (!context) {
      throw new Error('Stimulus is not registered');
    }
    return context;
  }

  getNucleus(): Nucleus<TOutput> {
    if (!this.nucleus) {
      throw new Error('Ciel has no Nucleus configuration');
    }
    return this.nucleus;
  }

  async start(): Promise<void> {
    if (this.state !== 'idle') {
      throw new Error('Ciel has already started');
    }

    this.state = 'starting';

    try {
      this.runtimes = [];
      this.contexts.forEach(context => context.clear());

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
    const context = this.getContext(stimulus);
    return {
      stimulus,
      sensus: new Sensus({
        auris: this.options.auris,
        lectio: this.options.lectio,
        oculus: this.options.oculus,
        signals: stimulus.signals,
      }),
      context,
      unsubscribers: [],
      started: false,
    };
  }

  private subscribe(runtime: StimulusRuntime): void {
    runtime.unsubscribers.push(
      runtime.sensus.on('data', percept => {
        runtime.context.ingest(percept);
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
