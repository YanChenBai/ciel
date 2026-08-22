import { randomUUID } from 'node:crypto';

import type { ASROptions } from '@ciels/asr';
import { EventHost, toError } from '@ciels/event';

import { Sensus } from '#sensus';
import type { SensusLectioOptions, SensusOculusOptions } from '#sensus';
import type { ContextInput, ContextSnapshot } from '#src/context/index.ts';
import { Nucleus } from '#src/nucleus/index.ts';
import type {
  NucleusObservedOperationCompleted,
  NucleusObservedOperationStarted,
  NucleusOptions,
} from '#src/nucleus/index.ts';
import { InMemoryPerceptStore } from '#src/percepts/index.ts';
import type { Percept } from '#src/percepts/index.ts';
import type { Signal } from '#src/signals/index.ts';
import type { Stimulus } from '#src/stimulus/index.ts';
import { captureVigiliaValue, serializeError, Vigilia } from '#src/vigilia/index.ts';
import type { VigiliaJsonValue, VigiliaOptions } from '#src/vigilia/index.ts';

import { Identity, Soul } from './prompts.ts';

export { Identity, Soul };

export type CielNucleusOptions<TOutput = string> = Omit<NucleusOptions<TOutput>, 'perceptStore'>;
export interface CielOptions<TOutput = string> {
  auris?: ASROptions;
  lectio?: SensusLectioOptions;
  nucleus: CielNucleusOptions<TOutput>;
  oculus?: SensusOculusOptions;
  vigilia?: Vigilia | VigiliaOptions;
}

export interface CielEventMap<TOutput = string> {
  data(data: Percept): void;
  error(error: Error): void;
  thought(output: TOutput, input: ContextInput): void;
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

export type CielState = 'idle' | 'starting' | 'running' | 'stopping';

export class Ciel<TOutput = string> extends EventHost<CielEventMap<TOutput>> {
  readonly vigilia: Vigilia;
  private readonly options: CielOptions<TOutput>;
  private readonly stimulus: Stimulus;
  private readonly nucleus: Nucleus<TOutput>;
  private readonly perceptStore: InMemoryPerceptStore;
  private runtime?: StimulusRuntime;
  private nucleusStarted = false;
  private state: CielState = 'idle';
  private activeAsr?: {
    readonly operationId: string;
    readonly startedAt: number;
    readonly mediaStartAt: Date;
  };

  constructor(stimulus: Stimulus, options: CielOptions<TOutput>) {
    super();
    this.stimulus = stimulus;
    this.options = options;
    this.vigilia =
      options.vigilia instanceof Vigilia ? options.vigilia : new Vigilia(options.vigilia);
    this.perceptStore = new InMemoryPerceptStore();
    this.perceptStore.register(stimulus);
    this.nucleus = new Nucleus({
      soul: Soul,
      identity: Identity,
      ...options.nucleus,
      perceptStore: this.perceptStore,
    });
    this.observeNucleus();
    this.perceptStore.on('append', record => {
      const content = this.vigilia.capturePerceptContent
        ? (record.content as unknown as VigiliaJsonValue)
        : undefined;
      this.vigilia.record('percept.appended', {
        ...(content ? { content } : {}),
        perceptType: record.percept.type,
        sequence: record.sequence,
        signal: record.signal.name,
        stimulus: record.stimulusDefinition.name,
      });
    });
    this.nucleus.register(stimulus);
  }

  getContext(): Promise<ContextSnapshot> {
    return this.nucleus.getContext();
  }

  async start(): Promise<void> {
    if (this.state !== 'idle') {
      throw new Error('Ciel has already started');
    }

    this.setState('starting');

    try {
      this.runtime = this.createRuntime(this.stimulus);
      this.subscribe(this.runtime);

      this.nucleus.start();
      this.nucleusStarted = true;
      this.runtime.started = true;
      await this.runtime.stimulus.start();

      this.setState('running');
    } catch (error) {
      await this.teardown();
      this.setState('idle');
      throw error;
    }
  }

  async stop(): Promise<void> {
    if (this.state !== 'running') {
      throw new Error('Ciel is not running');
    }
    this.setState('stopping');
    const errors = await this.teardown();
    this.setState('idle');
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
      runtime.sensus.on('speechstart', at => this.startAsr(at)),
      runtime.sensus.on('speechend', at => this.completeAsr(at)),
      runtime.sensus.on('error', error => {
        this.failAsr(error);
        this.vigilia.error('sensus', 'process', error);
        this.emit('error', error);
      }),
      runtime.stimulus.on('data', signal => this.dispatch(runtime, signal)),
    );
  }

  private dispatch(runtime: StimulusRuntime, signal: Signal): Promise<void> {
    const Signal = signal.constructor as { readonly meta?: { readonly name?: string } };
    const name = Signal.meta?.name ?? signal.constructor.name;
    const operationId = randomUUID();
    const sensoryOperationId = randomUUID();
    const startedAt = Date.now();
    if (this.vigilia.signals) {
      this.vigilia.record('signal.processing.started', { operationId, signal: name });
    }
    this.vigilia.record('operation.started', {
      category: 'sensory',
      name: sensoryOperationName(name),
      operationId: sensoryOperationId,
      ...(this.vigilia.signals ? { parentOperationId: operationId } : {}),
    });
    return runtime.sensus.process(signal).then(
      () => {
        this.vigilia.record('operation.completed', {
          category: 'sensory',
          durationMs: Date.now() - startedAt,
          name: sensoryOperationName(name),
          operationId: sensoryOperationId,
          ...(this.vigilia.signals ? { parentOperationId: operationId } : {}),
        });
        if (this.vigilia.signals)
          this.vigilia.record('signal.processing.completed', {
            durationMs: Date.now() - startedAt,
            operationId,
            signal: name,
          });
      },
      error => {
        this.vigilia.record('operation.failed', {
          category: 'sensory',
          durationMs: Date.now() - startedAt,
          error: serializeError(error),
          name: sensoryOperationName(name),
          operationId: sensoryOperationId,
          ...(this.vigilia.signals ? { parentOperationId: operationId } : {}),
        });
        if (this.vigilia.signals)
          this.vigilia.record('signal.processing.failed', {
            durationMs: Date.now() - startedAt,
            error: serializeError(error),
            operationId,
            signal: name,
          });
        throw error;
      },
    );
  }

  private observeNucleus(): void {
    this.nucleus.on('thought', (output, input) => this.emit('thought', output, input));
    this.nucleus.on('error', error => this.emit('error', error));
    this.nucleus.on('visionComposed', event => {
      const relativePath = this.vigilia.assetPath(event.path);
      if (!relativePath) return;
      this.vigilia.record('vision.composed', {
        frameCount: event.frameCount,
        path: relativePath,
        signal: event.signal,
        stimulus: event.stimulus,
      });
    });
    this.nucleus.on('thinkStarted', event => {
      this.vigilia.record('nucleus.think.started', {
        fromSequence: event.fromSequence,
        operationId: event.operationId,
        throughSequence: event.throughSequence,
        trigger: event.trigger,
      });
    });
    this.nucleus.on('thinkCompleted', event => {
      try {
        const output = this.vigilia.capture.result
          ? captureVigiliaValue(event.output)
          : this.vigilia.projectThought?.(event.output);
        this.vigilia.record('nucleus.think.completed', {
          durationMs: event.durationMs,
          ...(event.inputTokens === undefined ? {} : { inputTokens: event.inputTokens }),
          operationId: event.operationId,
          ...(output === undefined ? {} : { output }),
          ...(event.outputTokens === undefined ? {} : { outputTokens: event.outputTokens }),
          ...(this.vigilia.capture.reasoning && event.reasoning
            ? { reasoning: captureVigiliaValue(event.reasoning) }
            : {}),
          trigger: event.trigger,
        });
      } catch (error) {
        this.vigilia.error('vigilia', 'project-thought', error);
        this.vigilia.record('nucleus.think.completed', {
          durationMs: event.durationMs,
          ...(event.inputTokens === undefined ? {} : { inputTokens: event.inputTokens }),
          operationId: event.operationId,
          ...(event.outputTokens === undefined ? {} : { outputTokens: event.outputTokens }),
          trigger: event.trigger,
        });
      }
    });
    this.nucleus.on('thinkFailed', event => {
      this.vigilia.record('nucleus.think.failed', {
        durationMs: event.durationMs,
        error: serializeError(event.error),
        operationId: event.operationId,
        trigger: event.trigger,
      });
    });
    this.nucleus.on('operationStarted', event => {
      const detail = this.captureOperationDetail(event, 'started');
      this.vigilia.record('operation.started', {
        category: event.category,
        ...(detail === undefined ? {} : { detail }),
        name: event.name,
        operationId: event.operationId,
        parentOperationId: event.parentOperationId,
      });
    });
    this.nucleus.on('operationCompleted', event => {
      const detail = this.captureOperationDetail(event, 'completed');
      this.vigilia.record('operation.completed', {
        category: event.category,
        ...(detail === undefined ? {} : { detail }),
        durationMs: event.durationMs,
        name: event.name,
        operationId: event.operationId,
        parentOperationId: event.parentOperationId,
      });
    });
    this.nucleus.on('operationFailed', event => {
      this.vigilia.record('operation.failed', {
        category: event.category,
        durationMs: event.durationMs,
        error: serializeError(event.error),
        name: event.name,
        operationId: event.operationId,
        parentOperationId: event.parentOperationId,
      });
    });
    this.nucleus.on('archiveStarted', operation => {
      this.vigilia.record('memory.archive.started', {
        fromSequence: operation.fromSequence,
        operationId: operation.operationId,
        recordCount: operation.recordCount,
        throughSequence: operation.throughSequence,
      });
    });
    this.nucleus.on('archiveCompleted', (operation, durationMs, result) => {
      this.vigilia.record('memory.archive.completed', {
        durationMs,
        fromSequence: operation.fromSequence,
        operationId: operation.operationId,
        recordCount: operation.recordCount,
        throughSequence: operation.throughSequence,
        ...(this.vigilia.capture.memory && result ? { summary: captureVigiliaValue(result) } : {}),
      });
    });
    this.nucleus.on('archiveFailed', (error, operation, durationMs) => {
      this.vigilia.record('memory.archive.failed', {
        durationMs,
        error: serializeError(error),
        operationId: operation.operationId,
      });
    });
  }

  private startAsr(at: Date): void {
    if (this.activeAsr) return;
    this.activeAsr = { mediaStartAt: at, operationId: randomUUID(), startedAt: Date.now() };
    this.vigilia.record('operation.started', {
      category: 'sensory',
      detail: { mediaStartAt: at.toISOString() },
      name: 'asr',
      operationId: this.activeAsr.operationId,
    });
  }

  private completeAsr(at: Date): void {
    const operation = this.activeAsr;
    if (!operation) return;
    this.activeAsr = undefined;
    this.vigilia.record('operation.completed', {
      category: 'sensory',
      detail: {
        audioDurationMs: Math.max(0, at.getTime() - operation.mediaStartAt.getTime()),
        mediaEndAt: at.toISOString(),
      },
      durationMs: Date.now() - operation.startedAt,
      name: 'asr',
      operationId: operation.operationId,
    });
  }

  private failAsr(error: Error): void {
    const operation = this.activeAsr;
    if (!operation) return;
    this.activeAsr = undefined;
    this.vigilia.record('operation.failed', {
      category: 'sensory',
      durationMs: Date.now() - operation.startedAt,
      error: serializeError(error),
      name: 'asr',
      operationId: operation.operationId,
    });
  }

  private captureOperationDetail(
    event: NucleusObservedOperationStarted | NucleusObservedOperationCompleted,
    phase: 'completed' | 'started',
  ): VigiliaJsonValue | undefined {
    const value =
      phase === 'started' ? event.detail : (event as NucleusObservedOperationCompleted).result;
    if (value === undefined) return undefined;
    if (event.category === 'context') {
      return this.vigilia.capture.context ? captureVigiliaValue(value) : undefined;
    }
    if (event.category === 'memory') {
      return this.vigilia.capture.memory ? captureVigiliaValue(value) : undefined;
    }
    if (event.category === 'tool') {
      const enabled =
        phase === 'started' ? this.vigilia.capture.toolInput : this.vigilia.capture.toolOutput;
      return enabled ? captureVigiliaValue(value) : undefined;
    }
    if (event.category === 'model' && event.name.startsWith('step:')) {
      if (!this.vigilia.capture.reasoning && !this.vigilia.capture.result) return undefined;
      const captured = captureVigiliaValue(value);
      if (typeof captured !== 'object' || captured === null || Array.isArray(captured))
        return captured;
      const detail = captured as Readonly<Record<string, VigiliaJsonValue>>;
      return {
        ...detail,
        ...(!this.vigilia.capture.reasoning ? { reasoning: '[capture disabled]' } : {}),
        ...(!this.vigilia.capture.result ? { text: '[capture disabled]' } : {}),
      };
    }
    if (event.category === 'model' && phase === 'started') {
      return this.vigilia.capture.context ? captureVigiliaValue(value) : undefined;
    }
    return undefined;
  }

  private setState(state: CielState): void {
    const from = this.state;
    this.state = state;
    this.vigilia.record('ciel.state.changed', { from, to: state });
  }

  private async teardown(): Promise<Error[]> {
    const errors: Error[] = [];
    // 等 Stimulus 完成停止后再解除订阅，保留停止期间产生的事件。
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
    errors.forEach(error => {
      this.vigilia.error('ciel', 'teardown', error);
      this.emit('error', error);
    });
    return errors;
  }
}

function sensoryOperationName(signal: string): string {
  const normalized = signal.toLowerCase();
  if (normalized.includes('photon')) return 'vision';
  if (normalized.includes('echo')) return 'audio-ingest';
  if (normalized.includes('script')) return 'text-ingest';
  return `process:${signal}`;
}
