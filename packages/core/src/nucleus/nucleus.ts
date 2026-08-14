import { randomUUID } from 'node:crypto';

import { EventHost, toError } from '@ciels/event';
import { Output, ToolLoopAgent } from 'ai';
import type { ToolSet } from 'ai';

import { Context } from '#src/context/index.ts';
import type {
  ContextInput,
  ContextSnapshot,
  ContextTrigger,
  ModelContext,
} from '#src/context/index.ts';
import { VisionProjector } from '#src/context/vision.ts';
import { EpisodeArchive } from '#src/memory/episode-archive.ts';
import { createMemoryTools } from '#src/memory/tool.ts';
import { InMemoryPerceptStore } from '#src/percepts/index.ts';
import type { Percept } from '#src/percepts/index.ts';
import type { PerceptCheckout, PerceptStore } from '#src/percepts/index.ts';
import type { SignalConstructor } from '#src/signals/index.ts';
import type { Stimulus } from '#src/stimulus/index.ts';

import { normalizeNucleusOptions } from './options.ts';
import type { NormalizedNucleusOptions } from './options.ts';
import type {
  NucleusEventMap,
  NucleusObservedOperationStarted,
  NucleusOperationCategory,
  NucleusOptions,
  NucleusThinkStarted,
} from './types.ts';

type NucleusState = 'idle' | 'running' | 'stopping';

interface NucleusCallOptions {
  readonly [key: string]: unknown;
  readonly input: ContextInput;
  readonly context: ModelContext;
}

type NucleusAgent<TOutput> = ToolLoopAgent<
  NucleusCallOptions,
  ToolSet,
  Record<string, unknown>,
  Output.Output<TOutput>
>;

/**
 * Ciel 的认知调度器，负责构建上下文并触发模型思考。
 */
export class Nucleus<TOutput = string> extends EventHost<NucleusEventMap<TOutput>> {
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
  private readonly nucleusConsumer: string;
  private state: NucleusState = 'idle';
  private startedAt = 0;
  private lastThinkAt?: number;
  private lastInputTokens = 0;
  private speechEndPending = false;
  private timer?: ReturnType<typeof setTimeout>;
  private inFlight?: Promise<TOutput>;

  constructor(options: NucleusOptions<TOutput>) {
    super();
    this.identity = options.identity ?? '';
    this.soul = options.soul ?? '';
    this.agent = options.agent ?? '';
    this.options = normalizeNucleusOptions(options);
    const vision = new VisionProjector(this.options.context.maxImages);
    this.context = new Context(this.signals, this.stimuli, vision);
    this.perceptStore = options.perceptStore ?? new InMemoryPerceptStore();
    this.nucleusConsumer = this.perceptStore.createConsumer('nucleus');
    this.episodeArchive = new EpisodeArchive({
      idleTimeout: this.options.memorySummary.idleTimeout,
      isBlocked: () => this.inFlight !== undefined,
      maxImages: this.options.context.maxImages,
      memory: this.options.memory,
      perceptStore: this.perceptStore,
      retainDuration: this.options.context.perceptWindow,
      vision,
    });
    this.episodeArchive.on('error', (error, operation, durationMs) => {
      this.emit('archiveFailed', error, operation, durationMs);
      this.emit('error', error);
    });
    this.episodeArchive.on('settled', (operation, durationMs, succeeded, result) => {
      if (succeeded) this.emit('archiveCompleted', operation, durationMs, result);
      this.schedule();
    });
    this.episodeArchive.on('start', operation => {
      this.emit('archiveStarted', operation);
      this.clearTimer();
    });
    this.modelAgent = this.createAgent();
  }

  private createAgent(): NucleusAgent<TOutput> {
    const tools = this.options.tools ?? {};
    const memoryTools = createMemoryTools(this.options.memory);
    return new ToolLoopAgent<
      NucleusCallOptions,
      ToolSet,
      Record<string, unknown>,
      Output.Output<TOutput>
    >({
      model: this.options.model,
      tools,
      output: (this.options.output ?? Output.text()) as Output.Output<TOutput>,
      ...(this.options.stopWhen ? { stopWhen: this.options.stopWhen } : {}),
      prepareCall: ({ options: call, ...settings }) => {
        return {
          ...settings,
          instructions: [{ role: 'system', content: call.context.system }],
          tools: {
            ...tools,
            ...memoryTools,
          },
        };
      },
    });
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

  think(): Promise<TOutput> {
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
      return this.inFlight;
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
    this.emit('thinkStarted', operation);
    try {
      const [longTermMemory, recentMemory] = await Promise.all([
        this.observeOperation(operation.operationId, 'memory', 'read-long-term', () =>
          this.options.memory.readLongTerm(),
        ),
        this.observeOperation(operation.operationId, 'memory', 'read-recent', () =>
          this.options.memory.readRecent(),
        ),
      ]);
      const context = await this.observeOperation(
        operation.operationId,
        'context',
        'resolve-percepts',
        () => this.resolveCheckout(checkout),
      );
      const input: ContextInput = { ...context, trigger };
      const modelContext = await this.observeOperation(
        operation.operationId,
        'context',
        'build-model-request',
        () =>
          this.context.build({
            input,
            internalSystem: [this.soul, this.identity, this.agent],
            longTermMemory,
            recentMemory,
            system: this.options.system,
            messages: this.options.messages,
          }),
      );
      const estimatedImageTokens = await this.context.estimateInputTokens(context.data);
      const toolOperations = new Map<string, NucleusObservedOperationStarted>();
      const stepOperations = new Map<number, NucleusObservedOperationStarted>();
      const result = await this.observeOperation(
        operation.operationId,
        'model',
        'generate',
        async () => {
          try {
            return await this.modelAgent.generate({
              messages: [...modelContext.messages],
              options: { input, context: modelContext },
              onStepStart: step => {
                stepOperations.set(
                  step.stepNumber,
                  this.startOperation(operation.operationId, 'model', `step:${step.stepNumber}`),
                );
              },
              onStepEnd: step => {
                const stepOperation = stepOperations.get(step.stepNumber);
                if (!stepOperation) return;
                stepOperations.delete(step.stepNumber);
                this.completeOperation(stepOperation, {
                  callId: step.callId,
                  finishReason: step.finishReason,
                  reasoning: step.reasoningText,
                  text: step.text,
                  usage: step.usage,
                });
              },
              onToolExecutionStart: event => {
                const toolOperation = this.startOperation(
                  operation.operationId,
                  'tool',
                  event.toolCall.toolName,
                  {
                    input: event.toolCall.input,
                    toolCallId: event.toolCall.toolCallId,
                  },
                );
                toolOperations.set(event.toolCall.toolCallId, toolOperation);
              },
              onToolExecutionEnd: event => {
                const toolOperation = toolOperations.get(event.toolCall.toolCallId);
                if (!toolOperation) return;
                toolOperations.delete(event.toolCall.toolCallId);
                if (event.toolOutput.type === 'tool-error') {
                  this.failOperation(toolOperation, event.toolOutput.error);
                  return;
                }
                this.completeOperation(toolOperation, {
                  output: event.toolOutput,
                  toolCallId: event.toolCall.toolCallId,
                });
              },
            });
          } catch (error) {
            for (const child of [...stepOperations.values(), ...toolOperations.values()]) {
              this.failOperation(child, error);
            }
            stepOperations.clear();
            toolOperations.clear();
            throw error;
          }
        },
        modelContext,
      );
      this.perceptStore.commit(checkout);
      this.compactPerceptStore();
      this.lastInputTokens = result.usage.inputTokens ?? estimatedImageTokens;
      const output = result.output as TOutput;
      this.emit('thought', output, input);
      this.emit('thinkCompleted', {
        ...operation,
        durationMs: Date.now() - operation.startedAt,
        inputTokens: result.usage.inputTokens,
        output,
        outputTokens: result.usage.outputTokens,
        reasoning: result.reasoningText,
      });
      return output;
    } catch (error) {
      if (trigger === 'speech-end') this.speechEndPending = true;
      const normalized = toError(error);
      this.emit('thinkFailed', {
        ...operation,
        durationMs: Date.now() - operation.startedAt,
        error: normalized,
      });
      this.emit('error', normalized);
      throw normalized;
    }
  }

  private async observeOperation<T>(
    parentOperationId: string,
    category: NucleusOperationCategory,
    name: string,
    action: () => Promise<T>,
    detail?: unknown,
  ): Promise<T> {
    const operation = this.startOperation(parentOperationId, category, name, detail);
    try {
      const result = await action();
      this.completeOperation(operation, result);
      return result;
    } catch (error) {
      const normalized = this.failOperation(operation, error);
      throw normalized;
    }
  }

  private startOperation(
    parentOperationId: string,
    category: NucleusOperationCategory,
    name: string,
    detail?: unknown,
  ): NucleusObservedOperationStarted {
    const operation: NucleusObservedOperationStarted = {
      category,
      ...(detail === undefined ? {} : { detail }),
      name,
      operationId: randomUUID(),
      parentOperationId,
      startedAt: Date.now(),
    };
    this.emit('operationStarted', operation);
    return operation;
  }

  private completeOperation(operation: NucleusObservedOperationStarted, result?: unknown): void {
    this.emit('operationCompleted', {
      ...operation,
      durationMs: Date.now() - operation.startedAt,
      ...(result === undefined ? {} : { result }),
    });
  }

  private failOperation(operation: NucleusObservedOperationStarted, error: unknown): Error {
    const normalized = toError(error);
    this.emit('operationFailed', {
      ...operation,
      durationMs: Date.now() - operation.startedAt,
      error: normalized,
    });
    return normalized;
  }

  private finish(pending: Promise<TOutput>): void {
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
      dueAt = this.lastThinkAt === undefined ? now : anchor + this.options.minThinkInterval;
    }

    this.timer = setTimeout(
      () => {
        this.timer = undefined;
        const trigger: ContextTrigger = this.speechEndPending ? 'speech-end' : 'interval';
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

  private async resolveCheckout(checkout: PerceptCheckout): Promise<ContextSnapshot> {
    const recent = this.perceptStore
      .snapshot(checkout.createdAt, this.options.context.perceptWindow)
      .records.filter(
        record => record.sequence <= checkout.throughSequence && record.content.type === 'text',
      );
    const data = await this.context.resolveInputData(checkout.records, recent);
    return {
      createdAt: checkout.createdAt,
      data,
      definitions: this.context.definitions,
    };
  }

  private compactPerceptStore(): void {
    this.perceptStore.compact(new Date(), this.options.context.perceptWindow);
  }
}
