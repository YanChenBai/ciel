import { EventHost, toError } from '@ciels/event';

import type { ContextSnapshot } from '#context';
import { Nucleus } from '#nucleus';
import type { NucleusThinkOptions } from '#nucleus';
import { InMemoryPerceptStore } from '#percepts';
import type { Stimulus } from '#stimulus';
import { Vigilia } from '#vigilia';
import { VigiliaChannel, VigiliaGroup } from '#vigilia';

import { Identity, Soul } from './prompts.ts';
import { CielRuntime } from './runtime.ts';
import type { CielEventMap, CielOptions, CielState } from './types.ts';

export { Identity, Soul };
export * from './types.ts';

/** Ciel 顶层运行时，只负责编排 Stimulus、Nucleus 与生命周期。 */
export class Ciel<TOutput = string> extends EventHost<CielEventMap<TOutput>> {
  readonly observations = new VigiliaGroup();
  readonly vigilia: Vigilia;
  private readonly observationChannel = new VigiliaChannel();
  private readonly options: CielOptions<TOutput>;
  private readonly stimulus: Stimulus;
  private readonly nucleus: Nucleus<TOutput>;
  private readonly perceptStore: InMemoryPerceptStore;
  private runtime?: CielRuntime;
  private disconnectRuntimeObservations?: () => void;
  private nucleusStarted = false;
  private state: CielState = 'idle';

  constructor(stimulus: Stimulus, options: CielOptions<TOutput>) {
    super();
    this.stimulus = stimulus;
    this.options = options;
    if (options.vigilia instanceof Vigilia) this.vigilia = options.vigilia;
    else this.vigilia = new Vigilia(options.vigilia);

    this.perceptStore = new InMemoryPerceptStore();
    this.perceptStore.register(stimulus);
    this.nucleus = new Nucleus({
      soul: Soul,
      identity: Identity,
      ...options.nucleus,
      perceptStore: this.perceptStore,
    });
    this.observations.add(this.observationChannel);
    this.observations.add(this.perceptStore.observations);
    this.observations.add(this.nucleus.observations);
    this.vigilia.connect(this.observations);
    this.nucleus.on('thought', (output, input) => this.emit('thought', output, input));
    this.nucleus.on('error', error => this.emit('error', error));
    this.nucleus.register(stimulus);
  }

  getContext(): Promise<ContextSnapshot> {
    return this.nucleus.getContext();
  }

  /** 基于当前人格、记忆与感知主动执行一次独立思考。 */
  think<TThinkOutput>(options: NucleusThinkOptions<TThinkOutput>): Promise<TThinkOutput> {
    return this.nucleus.think(options);
  }

  /**
   * 轮换当前 Stimulus 的感官运行时，并建立新的实时感知边界。
   * Nucleus、Memory 与 Vigilia 保持连续；调用返回时 Stimulus 已重新启动但尚可没有数据源。
   */
  async resetPerception(): Promise<void> {
    if (this.state !== 'running' || !this.runtime) throw new Error('Ciel is not running');
    const previous = this.runtime;
    await previous.stopSource();
    await previous.close();
    this.disconnectRuntimeObservations?.();
    this.disconnectRuntimeObservations = undefined;
    this.runtime = undefined;

    let resetError: unknown;
    try {
      await this.nucleus.resetPerception();
    } catch (error) {
      resetError = error;
    }

    const runtime = this.createRuntime();
    const disconnect = this.observations.add(runtime.observations);
    try {
      await runtime.startSource();
      this.runtime = runtime;
      this.disconnectRuntimeObservations = disconnect;
      if (resetError !== undefined) throw resetError;
    } catch (error) {
      if (this.runtime === runtime) throw error;
      disconnect();
      await runtime.close().catch(() => undefined);
      throw error;
    }
  }

  async start(): Promise<void> {
    if (this.state !== 'idle') throw new Error('Ciel has already started');
    this.setState('starting');

    try {
      this.runtime = this.createRuntime();
      this.disconnectRuntimeObservations = this.observations.add(this.runtime.observations);
      this.nucleus.start();
      this.nucleusStarted = true;
      await this.runtime.startSource();
      this.setState('running');
    } catch (error) {
      await this.teardown();
      this.setState('idle');
      throw error;
    }
  }

  async stop(): Promise<void> {
    if (this.state !== 'running') throw new Error('Ciel is not running');
    this.setState('stopping');
    const errors = await this.teardown();
    this.setState('idle');
    if (errors.length > 0) throw new AggregateError(errors, 'Failed to stop Ciel cleanly');
  }

  private createRuntime(): CielRuntime {
    return new CielRuntime({
      stimulus: this.stimulus,
      sensus: this.options,
      events: {
        data: percept => {
          this.nucleus.ingest(this.stimulus, percept);
          this.emit('data', percept);
        },
        error: error => {
          this.emit('error', error);
        },
        speechEnd: () => {
          this.nucleus.speechEnd();
        },
      },
    });
  }

  private setState(state: CielState): void {
    const from = this.state;
    this.state = state;
    this.observationChannel.emit('ciel.state.changed', { from, to: state });
  }

  private async teardown(): Promise<Error[]> {
    const errors: Error[] = [];
    const runtime = this.runtime;

    // 先停止 Stimulus，保留停止期间产生的最后一批事件给仍在运行的 Nucleus。
    if (runtime) {
      try {
        await runtime.stopSource();
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

    if (runtime) {
      try {
        await runtime.close();
      } catch (error) {
        errors.push(toError(error));
      }
    }
    this.disconnectRuntimeObservations?.();
    this.disconnectRuntimeObservations = undefined;
    this.runtime = undefined;

    for (const error of errors) {
      this.observationChannel.emit('error.observed', {
        error,
        phase: 'teardown',
        source: 'ciel',
      });
      this.emit('error', error);
    }
    return errors;
  }
}
