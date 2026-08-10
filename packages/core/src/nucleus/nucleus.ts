import { EventHost, toError } from '@ciels/event';
import type { Unsubscribe } from '@ciels/event';

import { Memory } from '#src/memory/index.ts';

import { runNucleusAgent } from './agent.ts';
import {
  DEFAULT_EPISODIC_MEMORY_LIMIT,
  DEFAULT_LONG_TERM_MEMORY_LIMIT,
  DEFAULT_MAX_THINK_INTERVAL,
  DEFAULT_MIN_THINK_INTERVAL,
} from './constants.ts';
import type { NucleusEventMap, NucleusInput, NucleusOptions, NucleusTrigger } from './types.ts';

type NucleusState = 'idle' | 'running' | 'stopping';

/**
 * Ciel 的认知调度器。它决定何时思考，并在每次思考前取得 Context 与 Memory。
 */
export class Nucleus<TOutput = string> extends EventHost<NucleusEventMap<TOutput>> {
  private readonly options: NucleusOptions<TOutput>;
  private readonly context: NucleusOptions<TOutput>['context'];
  private readonly longTermMemoryLimit: number;
  private readonly episodicMemoryLimit: number;
  private readonly minThinkInterval: number;
  private readonly maxThinkInterval: number;

  private state: NucleusState = 'idle';
  private startedAt = 0;
  private lastThinkAt?: number;
  private dirty = false;
  private timer?: ReturnType<typeof setTimeout>;
  private unsubscribe?: Unsubscribe;
  private inFlight?: Promise<TOutput>;
  private memory?: Memory;

  constructor(options: NucleusOptions<TOutput>) {
    super();
    this.options = options;
    this.context = options.context;
    this.longTermMemoryLimit = options.memory?.longTermLimit ?? DEFAULT_LONG_TERM_MEMORY_LIMIT;
    this.episodicMemoryLimit = options.memory?.episodicLimit ?? DEFAULT_EPISODIC_MEMORY_LIMIT;
    this.minThinkInterval = options.minThinkInterval ?? DEFAULT_MIN_THINK_INTERVAL;
    this.maxThinkInterval = options.maxThinkInterval ?? DEFAULT_MAX_THINK_INTERVAL;

    if (!Number.isInteger(this.longTermMemoryLimit) || this.longTermMemoryLimit < 0) {
      throw new Error('nucleus.memory.longTermLimit must be a non-negative integer');
    }
    if (!Number.isInteger(this.episodicMemoryLimit) || this.episodicMemoryLimit < 0) {
      throw new Error('nucleus.memory.episodicLimit must be a non-negative integer');
    }
    if (!Number.isFinite(this.minThinkInterval) || this.minThinkInterval <= 0) {
      throw new Error('nucleus.minThinkInterval must be a positive finite number');
    }
    if (!Number.isFinite(this.maxThinkInterval) || this.maxThinkInterval <= 0) {
      throw new Error('nucleus.maxThinkInterval must be a positive finite number');
    }
    if (this.maxThinkInterval < this.minThinkInterval) {
      throw new Error('nucleus.maxThinkInterval must be greater than or equal to minThinkInterval');
    }
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
    this.dirty = this.context.snapshot().data.length > 0;
    this.unsubscribe = this.context.on('change', () => {
      this.dirty = true;
      this.schedule();
    });
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
    this.unsubscribe?.();
    this.unsubscribe = undefined;

    try {
      await this.inFlight;
    } finally {
      await this.memory?.close();
      this.memory = undefined;
      this.state = 'idle';
      this.dirty = false;
      this.lastThinkAt = undefined;
    }
  }

  /**
   * 忽略调度间隔，手动请求一次思考。
   */
  think(): Promise<TOutput> {
    return this.requestThink('manual');
  }

  /**
   * 取得 Nucleus 内置的唯一 Memory 实例。
   */
  getMemory(): Memory {
    if (!this.options.memory) {
      throw new Error('Nucleus memory is not enabled');
    }
    return (this.memory ??= this.createMemory());
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
    const context = this.context.snapshot();

    try {
      const memory = this.options.memory ? this.getMemory() : undefined;
      const memoryContext = await memory?.getContext({
        longTermLimit: this.longTermMemoryLimit,
        episodicLimit: this.episodicMemoryLimit,
      });
      const memories = memoryContext?.entries ?? [];
      const input: NucleusInput = {
        trigger,
        context,
        memories,
        ...(memoryContext?.instructions ? { memoryInstructions: memoryContext.instructions } : {}),
      };
      const output = await runNucleusAgent(input, this.options, memory);
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
        : anchor + (this.dirty ? this.minThinkInterval : this.maxThinkInterval);

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

  private createMemory(): Memory {
    const {
      episodicLimit: _episodicLimit,
      longTermLimit: _longTermLimit,
      ...options
    } = this.options.memory ?? {};
    return new Memory({ ...options, model: this.options.model });
  }
}
