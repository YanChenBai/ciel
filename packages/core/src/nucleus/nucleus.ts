import { randomUUID } from 'node:crypto';

import { EventHost, toError } from '@ciels/event';

import { Context } from '#context';
import type { ContextInput, ContextMessage, ContextSnapshot, ContextTrigger } from '#context';
import { VisionProjector } from '#context/vision.ts';
import { EpisodeArchive } from '#memory/episode-archive.ts';
import { InMemoryPerceptStore } from '#percepts';
import type { Percept } from '#percepts';
import type { PerceptCheckout, PerceptSnapshot, PerceptStore } from '#percepts';
import type { SignalConstructor } from '#signals';
import type { Stimulus } from '#stimulus';
import { toVigiliaName } from '#vigilia';
import type { VigiliaOperationContext } from '#vigilia';
import { VigiliaChannel, VigiliaGroup } from '#vigilia';

import { createNucleusAgent } from './agent.ts';
import type { NucleusAgent } from './agent.ts';
import { NucleusOperations } from './operations.ts';
import { normalizeNucleusOptions } from './options.ts';
import type { NormalizedNucleusOptions } from './options.ts';
import type {
  NucleusEventMap,
  NucleusOptions,
  NucleusThinkOptions,
  NucleusThinkStarted,
} from './types.ts';

type NucleusState = 'idle' | 'running' | 'stopping';

interface ThinkExecution<TOutput> {
  readonly agent: NucleusAgent<TOutput>;
  readonly messages?: readonly ContextMessage[];
  readonly onFailed?: () => void;
  readonly onSucceeded?: (output: TOutput, input: ContextInput) => void;
  readonly operation: NucleusThinkStarted;
  readonly resolveContext: (context: VigiliaOperationContext) => Promise<ContextSnapshot>;
  readonly system?: readonly string[];
}

/**
 * Ciel 的认知调度器，负责构建上下文并触发模型思考。
 */
export class Nucleus<TOutput = string> extends EventHost<NucleusEventMap<TOutput>> {
  readonly observations = new VigiliaGroup();
  readonly identity: string;
  readonly soul: string;
  readonly agent: string;
  private readonly options: NormalizedNucleusOptions<TOutput>;
  private readonly signals: SignalConstructor[] = [];
  private readonly stimuli: Stimulus[] = [];
  private readonly context: Context;
  private readonly perceptStore: PerceptStore;
  private readonly modelAgent: NucleusAgent<TOutput>;
  private readonly episodeArchive: EpisodeArchive;
  private readonly observationChannel = new VigiliaChannel();
  private readonly operations: NucleusOperations;
  private readonly nucleusConsumer: string;
  private state: NucleusState = 'idle';
  private startedAt = 0;
  private lastThinkAt?: number;
  private lastInputTokens = 0;
  private speechEndPending = false;
  private timer?: ReturnType<typeof setTimeout>;
  private inFlight?: Promise<unknown>;

  constructor(options: NucleusOptions<TOutput>) {
    super();
    this.identity = options.identity ?? '';
    this.soul = options.soul ?? '';
    this.agent = options.agent ?? '';
    this.options = normalizeNucleusOptions(options);
    this.observations.add(this.observationChannel);
    this.observations.add(options.memory.observations);
    const vision = new VisionProjector(this.options.context.maxImages, event => {
      this.observationChannel.emit('vision.composed', event);
    });
    this.context = new Context(this.signals, this.stimuli, vision);
    this.observations.add(this.context.observations);
    this.perceptStore = options.perceptStore ?? new InMemoryPerceptStore();
    this.nucleusConsumer = this.perceptStore.createConsumer('nucleus');
    this.operations = new NucleusOperations(this.observationChannel);
    this.episodeArchive = new EpisodeArchive({
      idleTimeout: this.options.memorySummary.idleTimeout,
      isBlocked: () => this.inFlight !== undefined,
      maxImages: this.options.context.maxImages,
      memory: this.options.memory,
      perceptStore: this.perceptStore,
      retainDuration: this.options.context.perceptWindow,
      vision,
    });
    this.observations.add(this.episodeArchive.observations);
    this.episodeArchive.on('error', error => {
      this.emit('error', error);
    });
    this.episodeArchive.on('settled', () => {
      this.schedule();
    });
    this.episodeArchive.on('start', () => {
      this.clearTimer();
    });
    this.modelAgent = createNucleusAgent(this.options, this.options.memory);
  }

  register(stimulus: Stimulus): void {
    if (this.stimuli.includes(stimulus)) {
      return;
    }
    this.stimuli.push(stimulus);
    for (const Signal of stimulus.signals) {
      if (!this.signals.includes(Signal)) {
        this.signals.push(Signal);
      }
    }
    this.perceptStore.register(stimulus);
  }

  ingest(stimulus: Stimulus, percept: Percept): void {
    this.perceptStore.append(stimulus, percept);
  }

  /**
   * 标记 VAD 已完成一段语音，并按最小思考间隔合并连续触发。
   */
  speechEnd(): void {
    if (this.state !== 'running') {
      return;
    }
    this.speechEndPending = true;
    this.schedule();
  }

  start(): void {
    if (this.state !== 'idle') {
      throw new Error('Nucleus has already started');
    }

    this.state = 'running';
    this.startedAt = Date.now();
    this.lastThinkAt = undefined;
    this.lastInputTokens = 0;
    this.speechEndPending = false;
    this.episodeArchive.start();
    this.schedule();
  }

  async stop(): Promise<void> {
    if (this.state !== 'running') {
      throw new Error('Nucleus is not running');
    }

    this.state = 'stopping';
    this.clearTimer();

    try {
      await this.inFlight;
      await this.episodeArchive.stop();
    } finally {
      this.state = 'idle';
      this.speechEndPending = false;
      this.lastThinkAt = undefined;
      this.lastInputTokens = 0;
    }
  }

  think(): Promise<TOutput>;
  think<TRequestedOutput>(
    options: NucleusThinkOptions<TRequestedOutput>,
  ): Promise<TRequestedOutput>;
  think<TRequestedOutput>(
    options?: NucleusThinkOptions<TRequestedOutput>,
  ): Promise<TOutput | TRequestedOutput> {
    if (options) return this.requestIndependentThink(options);
    return this.requestThink('manual');
  }

  async getContext(createdAt: Date = new Date()): Promise<ContextSnapshot> {
    const records = this.perceptStore.snapshot(
      createdAt,
      this.options.context.perceptWindow,
    ).records;
    return {
      createdAt,
      data: this.context.selectSnapshotData(records),
      definitions: this.context.definitions,
    };
  }

  private requestThink(trigger: ContextTrigger): Promise<TOutput> {
    if (this.inFlight) {
      return this.inFlight.then(
        () => this.requestThink(trigger),
        () => this.requestThink(trigger),
      );
    }
    this.clearTimer();
    const pending = this.execute(trigger);
    this.inFlight = pending;
    void pending.then(
      () => this.finish(pending),
      () => this.finish(pending),
    );
    return pending;
  }

  private async requestIndependentThink<TRequestedOutput>(
    options: NucleusThinkOptions<TRequestedOutput>,
  ): Promise<TRequestedOutput> {
    // 主动思考与自动思考共享模型和记忆状态，因此必须串行，不能只等待最初看到的任务。
    while (this.inFlight) {
      await this.inFlight.catch(() => undefined);
    }
    this.clearTimer();
    const pending = this.executeIndependent(options);
    this.inFlight = pending;
    void pending.then(
      () => this.finish(pending),
      () => this.finish(pending),
    );
    return pending;
  }

  private async execute(trigger: ContextTrigger): Promise<TOutput> {
    this.speechEndPending = false;
    const checkout = this.perceptStore.checkout(this.nucleusConsumer);
    const operation: NucleusThinkStarted = {
      fromSequence: checkout.fromSequence,
      operationId: randomUUID(),
      startedAt: Date.now(),
      throughSequence: checkout.throughSequence,
      trigger,
    };
    return this.executeThinking({
      agent: this.modelAgent,
      messages: this.options.messages,
      operation,
      resolveContext: context => this.resolveCheckout(checkout, context),
      system: this.options.system,
      onFailed: () => {
        if (trigger === 'speech-end') this.speechEndPending = true;
      },
      onSucceeded: (output, input) => {
        // checkout 只有在模型成功后才推进，失败时仍保留同一批感知用于重试。
        this.perceptStore.commit(checkout);
        this.compactPerceptStore();
        this.emit('thought', output, input);
      },
    });
  }

  private async executeIndependent<TRequestedOutput>(
    options: NucleusThinkOptions<TRequestedOutput>,
  ): Promise<TRequestedOutput> {
    const snapshot = this.perceptStore.snapshot(new Date(), this.options.context.perceptWindow);
    const firstSequence = snapshot.records.at(0)?.sequence;
    const throughSequence = snapshot.records.at(-1)?.sequence ?? 0;
    let fromSequence = throughSequence;
    if (firstSequence !== undefined) fromSequence = Math.max(0, firstSequence - 1);

    const operation: NucleusThinkStarted = {
      fromSequence,
      name: toVigiliaName(options.name, 'requested-think'),
      operationId: randomUUID(),
      startedAt: Date.now(),
      throughSequence,
      trigger: 'requested',
    };
    const agent = createNucleusAgent<TRequestedOutput>(
      {
        model: this.options.model,
        output: options.output,
        ...(options.prepareStep ? { prepareStep: options.prepareStep } : {}),
        ...(options.stopWhen ? { stopWhen: options.stopWhen } : {}),
        ...(options.tools ? { tools: options.tools } : {}),
      },
      this.options.memory,
    );

    return this.executeThinking({
      agent,
      messages: [normalizeThinkPrompt(options.prompt)],
      operation,
      resolveContext: context => this.resolveSnapshot(snapshot, context),
      system: options.system,
    });
  }

  /**
   * 统一执行两类思考的公共流水线；感知是否提交等业务差异由调用方通过回调明确表达。
   */
  private async executeThinking<TThinkOutput>(
    execution: ThinkExecution<TThinkOutput>,
  ): Promise<TThinkOutput> {
    const { operation } = execution;
    this.observationChannel.emit('nucleus.think.started', operation);

    try {
      const [longTermMemory, recentMemory] = await Promise.all([
        this.options.memory.readLongTerm({ parentOperationId: operation.operationId }),
        this.options.memory.readRecent({ parentOperationId: operation.operationId }),
      ]);
      const operationContext = { parentOperationId: operation.operationId };
      const context = await execution.resolveContext(operationContext);
      const input: ContextInput = { ...context, trigger: operation.trigger };
      const modelContext = await this.context.build(
        {
          input,
          internalSystem: [this.soul, this.identity, this.agent],
          longTermMemory,
          recentMemory,
          system: execution.system,
          messages: execution.messages,
        },
        operationContext,
      );
      const estimatedImageTokens = await this.context.estimateInputTokens(context.data);
      const result = await this.operations.generate(
        operation.operationId,
        execution.agent,
        input,
        modelContext,
      );
      this.lastInputTokens = result.usage.inputTokens ?? estimatedImageTokens;
      const output = result.output as TThinkOutput;
      if (execution.onSucceeded) execution.onSucceeded(output, input);

      this.observationChannel.emit('nucleus.think.completed', {
        ...operation,
        durationMs: Date.now() - operation.startedAt,
        inputTokens: result.usage.inputTokens,
        output,
        outputTokens: result.usage.outputTokens,
        reasoning: result.reasoningText,
      });
      return output;
    } catch (error) {
      if (execution.onFailed) execution.onFailed();
      const normalized = toError(error);
      this.observationChannel.emit('nucleus.think.failed', {
        ...operation,
        durationMs: Date.now() - operation.startedAt,
        error: normalized,
      });
      this.emit('error', normalized);
      throw normalized;
    }
  }

  private finish(pending: Promise<unknown>): void {
    if (this.inFlight !== pending) {
      return;
    }
    this.inFlight = undefined;
    this.lastThinkAt = Date.now();
    if (this.lastInputTokens >= this.options.memorySummary.maxTokens) {
      this.episodeArchive.request();
      this.schedule();
      return;
    }
    this.episodeArchive.schedule();
    this.schedule();
  }

  private schedule(): void {
    if (this.state !== 'running' || this.inFlight || this.episodeArchive.active) {
      return;
    }

    this.clearTimer();
    const now = Date.now();
    const anchor = this.lastThinkAt ?? this.startedAt;
    let dueAt = anchor + this.options.maxThinkInterval;
    if (this.speechEndPending) {
      // 第一段语音可立即触发；后续语音至少与上一次思考相隔 minThinkInterval。
      dueAt = anchor + this.options.minThinkInterval;
      if (this.lastThinkAt === undefined) dueAt = now;
    }

    this.timer = setTimeout(
      () => {
        this.timer = undefined;
        let trigger: ContextTrigger = 'interval';
        if (this.speechEndPending) trigger = 'speech-end';
        void this.requestThink(trigger).catch(() => undefined);
      },
      Math.max(0, dueAt - now),
    );
  }

  private clearTimer(): void {
    if (this.timer === undefined) {
      return;
    }
    clearTimeout(this.timer);
    this.timer = undefined;
  }

  private async resolveCheckout(
    checkout: PerceptCheckout,
    context: VigiliaOperationContext,
  ): Promise<ContextSnapshot> {
    const recent = this.perceptStore
      .snapshot(checkout.createdAt, this.options.context.perceptWindow)
      .records.filter(
        record => record.sequence <= checkout.throughSequence && record.content.type === 'text',
      );
    return this.resolvePercepts(checkout.createdAt, checkout.records, recent, context);
  }

  private async resolveSnapshot(
    snapshot: PerceptSnapshot,
    context: VigiliaOperationContext,
  ): Promise<ContextSnapshot> {
    const recentTexts = snapshot.records.filter(record => record.content.type === 'text');
    return this.resolvePercepts(snapshot.createdAt, snapshot.records, recentTexts, context);
  }

  private async resolvePercepts(
    createdAt: Date,
    records: PerceptSnapshot['records'],
    recentTexts: PerceptSnapshot['records'],
    context: VigiliaOperationContext,
  ): Promise<ContextSnapshot> {
    const data = await this.context.resolveInputData(records, recentTexts, context);
    return {
      createdAt,
      data,
      definitions: this.context.definitions,
    };
  }

  private compactPerceptStore(): void {
    this.perceptStore.compact(new Date(), this.options.context.perceptWindow);
  }
}

function normalizeThinkPrompt(prompt: NucleusThinkOptions<unknown>['prompt']): ContextMessage {
  if (typeof prompt !== 'string') return prompt;
  return () => ({ role: 'user', content: prompt });
}
