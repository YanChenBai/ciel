import { EventHost, toError } from '@ciels/event';
import type { Unsubscribe } from '@ciels/event';

import { Memory } from '#src/memory/index.ts';
import type { Percept } from '#src/percepts/index.ts';
import type { Stimulus } from '#src/stimulus/index.ts';

import { NucleusContextStore } from './context.ts';
import { EpisodeRecorder } from './episode.ts';
import { resolveNucleusMessages } from './messages.ts';
import { normalizeNucleusOptions } from './options.ts';
import type { NormalizedNucleusOptions } from './options.ts';
import { createNucleusPrompt } from './prompt.ts';
import { createNucleusToolLoopAgent } from './tool-loop-agent.ts';
import type { NucleusToolLoopAgent } from './tool-loop-agent.ts';
import type {
  ContextDefinitionInput,
  NucleusContext,
  NucleusEventMap,
  NucleusInput,
  NucleusOptions,
  NucleusTrigger,
} from './types.ts';

type NucleusState = 'idle' | 'running' | 'stopping';

/**
 * Ciel 的认知核心，统一管理实时感知、记忆、思考与工具调用。
 */
export class Nucleus<TOutput = string> extends EventHost<NucleusEventMap<TOutput>> {
  private readonly options: NormalizedNucleusOptions<TOutput>;
  private readonly memory: Memory;
  private readonly context: NucleusContextStore;
  private readonly episodes: EpisodeRecorder;
  private readonly agent: NucleusToolLoopAgent<TOutput>;
  private state: NucleusState = 'idle';
  private startedAt = 0;
  private lastThinkAt?: number;
  private dirty = false;
  private timer?: ReturnType<typeof setTimeout>;
  private episodeTimer?: ReturnType<typeof setTimeout>;
  private inFlight?: Promise<TOutput>;
  private unsubscribe?: Unsubscribe;

  constructor(options: NucleusOptions<TOutput>) {
    super();
    this.options = normalizeNucleusOptions(options);
    const {
      episode,
      episodicLimit: _episodicLimit,
      longTermLimit: _longTermLimit,
      ...memoryOptions
    } = this.options.memory;

    this.memory = new Memory({ ...memoryOptions, model: this.options.model });
    this.context = new NucleusContextStore(
      this.options.context.perceptWindow,
      this.options.context.maxImages,
      this.options.context.definitions,
    );
    this.episodes = new EpisodeRecorder(this.memory, this.options.model, episode);
    this.agent = createNucleusToolLoopAgent(this.memory, this.options);
  }

  /** 注册一个可向 Nucleus 提供实时感知的 Stimulus。 */
  register(stimulus: Stimulus): void {
    this.context.register(stimulus);
  }

  /** 接收 Sensus 已处理完成的实时感知。 */
  ingest(stimulus: Stimulus, percept: Percept): void {
    this.episodes.ingest(this.context.ingest(stimulus, percept));
    this.scheduleEpisodeFlush();
  }

  /** 添加一条运行时定义，返回幂等的移除函数。 */
  define(definition: ContextDefinitionInput): () => void {
    return this.context.define(definition);
  }

  /**
   * 启动感知订阅与思考计时器。
   */
  start(): void {
    if (this.state !== 'idle') {
      throw new Error('Nucleus has already started');
    }

    this.state = 'running';
    this.startedAt = Date.now();
    this.lastThinkAt = undefined;
    this.dirty = false;
    this.unsubscribe = this.context.on('change', () => {
      this.dirty = true;
      this.schedule();
    });
    this.scheduleEpisodeFlush();
    this.schedule();
  }

  /**
   * 停止接收新任务，并等待正在进行的思考完成。
   */
  async stop(): Promise<void> {
    if (this.state !== 'running') {
      throw new Error('Nucleus is not running');
    }

    this.state = 'stopping';
    this.clearTimer();
    this.clearEpisodeTimer();
    this.unsubscribe?.();
    this.unsubscribe = undefined;

    try {
      await this.inFlight;
    } finally {
      try {
        const archived = await this.episodes.flush();
        this.context.remove(archived);
      } finally {
        await this.memory.close();
        this.context.clear();
        this.state = 'idle';
        this.dirty = false;
        this.lastThinkAt = undefined;
      }
    }
  }

  /**
   * 忽略调度间隔，手动请求一次思考。
   */
  think(): Promise<TOutput> {
    return this.requestThink('manual');
  }

  /**
   * 取得 Nucleus 内部持有的 Memory 实例。
   */
  getMemory(): Memory {
    return this.memory;
  }

  /** 结束当前连续经历并生成一条情景记忆；没有有效 Percept 时不写入。 */
  async flushEpisode(): Promise<void> {
    this.clearEpisodeTimer();
    const archived = await this.episodes.flush();
    this.context.remove(archived);
    this.scheduleEpisodeFlush();
  }

  /** 取得当前实时感知与召回记忆组成的完整 Context。 */
  async getContext(createdAt: Date = new Date()): Promise<NucleusContext> {
    const snapshot = this.context.snapshot(createdAt);
    const memoryContext = await this.memory.getContext({
      longTermLimit: this.options.memory.longTermLimit,
      episodicLimit: this.options.memory.episodicLimit,
    });
    return {
      ...snapshot,
      memories: memoryContext.entries,
      ...(memoryContext.instructions ? { memoryInstructions: memoryContext.instructions } : {}),
    };
  }

  private requestThink(trigger: NucleusTrigger): Promise<TOutput> {
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

  private async execute(trigger: NucleusTrigger): Promise<TOutput> {
    this.dirty = false;
    try {
      const context = await this.getContext();
      const input: NucleusInput = {
        ...context,
        trigger,
      };
      const prompt = createNucleusPrompt(input);
      const result = await this.agent.generate({
        messages: await resolveNucleusMessages(input, this.options.messages, prompt),
        options: { input, prompt },
      });
      const output = result.output as TOutput;
      this.episodes.recordRun({
        output,
        inputTokens: result.usage.inputTokens,
        steps: result.steps.map(step => ({
          ...(step.text ? { text: step.text } : {}),
          toolCalls: step.toolCalls,
          toolResults: step.toolResults,
        })),
      });
      this.emit('thought', output, input);
      return output;
    } catch (error) {
      const normalized = toError(error);
      this.emit('error', normalized);
      throw normalized;
    }
  }

  private finish(pending: Promise<TOutput>): void {
    if (this.inFlight !== pending) {
      return;
    }
    this.inFlight = undefined;
    this.lastThinkAt = Date.now();
    if (this.episodes.pressured) {
      void this.flushEpisode().then(
        () => this.schedule(),
        error => {
          this.emit('error', toError(error));
          this.scheduleEpisodeFlush();
          this.schedule();
        },
      );
      return;
    }
    this.scheduleEpisodeFlush();
    this.schedule();
  }

  private schedule(): void {
    if (this.state !== 'running' || this.inFlight) {
      return;
    }

    this.clearTimer();
    const now = Date.now();
    const anchor = this.lastThinkAt ?? this.startedAt;
    const dueAt =
      this.dirty && this.lastThinkAt === undefined
        ? now
        : anchor + (this.dirty ? this.options.minThinkInterval : this.options.maxThinkInterval);

    this.timer = setTimeout(
      () => {
        this.timer = undefined;
        const trigger = this.dirty ? 'percept' : 'interval';
        void this.requestThink(trigger).catch(() => undefined);
      },
      Math.max(0, dueAt - now),
    );
  }

  private clearTimer(): void {
    if (this.timer !== undefined) {
      clearTimeout(this.timer);
      this.timer = undefined;
    }
  }

  private scheduleEpisodeFlush(): void {
    this.clearEpisodeTimer();
    if (this.state !== 'running' || !this.episodes.active) return;
    const dueAt = this.episodes.dueAt;
    if (dueAt === undefined) return;
    this.episodeTimer = setTimeout(
      () => {
        this.episodeTimer = undefined;
        if (this.inFlight) return;
        void this.flushEpisode().catch(error => this.emit('error', toError(error)));
      },
      Math.max(0, dueAt - Date.now()),
    );
  }

  private clearEpisodeTimer(): void {
    if (this.episodeTimer !== undefined) {
      clearTimeout(this.episodeTimer);
      this.episodeTimer = undefined;
    }
  }
}
