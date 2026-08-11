import { EventHost, toError } from '@ciels/event';
import type { Unsubscribe } from '@ciels/event';
import { generateText, Output, ToolLoopAgent } from 'ai';
import type { FilePart, TextPart, ToolSet } from 'ai';

import { Context, createContextPrompt } from '#src/context/index.ts';
import type { ContextSection } from '#src/context/index.ts';
import { createMemoryTools } from '#src/memory/tool.ts';
import type { Percept } from '#src/percepts/index.ts';
import type { SignalConstructor } from '#src/signals/index.ts';
import type { Stimulus } from '#src/stimulus/index.ts';

import { estimateImageTokens, resolveImagePart } from './image.ts';
import { resolveNucleusMessages } from './messages.ts';
import { normalizeNucleusOptions } from './options.ts';
import type { NormalizedNucleusOptions } from './options.ts';
import { NucleusPerceptStore } from './percept-store.ts';
import type {
  ContextData,
  NucleusContext,
  NucleusEventMap,
  NucleusInput,
  NucleusInternalDefinitions,
  NucleusOptions,
  NucleusPrompt,
  NucleusTrigger,
} from './types.ts';

type NucleusState = 'idle' | 'running' | 'stopping';

interface NucleusCallOptions {
  readonly [key: string]: unknown;
  readonly input: NucleusInput;
  readonly prompt: NucleusPrompt;
}

type NucleusAgent<TOutput> = ToolLoopAgent<
  NucleusCallOptions,
  ToolSet,
  Record<string, unknown>,
  Output.Output<TOutput>
>;

const MEMORY_RULES = [
  '当前上下文不足时，使用 memory_recall 按语义搜索历史经历。',
  '发现新的稳定事实、偏好或经验时，使用 memory_update 提交精炼、去重后的完整全局记忆。',
].join('\n');

/**
 * Ciel 的认知调度器，负责思考与记忆总结的触发时机。
 */
export class Nucleus<TOutput = string> extends EventHost<NucleusEventMap<TOutput>> {
  private readonly options: NormalizedNucleusOptions<TOutput>;
  private readonly signals: SignalConstructor[] = [];
  private readonly stimuli: Stimulus[] = [];
  private readonly context: Context;
  private readonly store: NucleusPerceptStore;
  private readonly agent: NucleusAgent<TOutput>;
  private state: NucleusState = 'idle';
  private startedAt = 0;
  private lastThinkAt?: number;
  private lastInputTokens = 0;
  private dirty = false;
  private timer?: ReturnType<typeof setTimeout>;
  private summaryTimer?: ReturnType<typeof setTimeout>;
  private inFlight?: Promise<TOutput>;
  private summaryInFlight?: Promise<void>;
  private unsubscribe?: Unsubscribe;

  constructor(
    options: NucleusOptions<TOutput>,
    private readonly internalDefinitions: NucleusInternalDefinitions = () => [],
  ) {
    super();
    this.options = normalizeNucleusOptions(options);
    this.context = new Context(this.signals, this.stimuli);
    this.store = new NucleusPerceptStore(
      this.options.context.perceptWindow,
      this.options.context.maxImages,
    );
    this.agent = this.createAgent();
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
        const instructions = call.prompt.system.map(content => ({
          role: 'system' as const,
          content,
        }));
        for (const content of this.options.system ?? []) {
          instructions.push({
            role: 'system',
            content,
          });
        }
        return {
          ...settings,
          instructions,
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
    this.store.register(stimulus);
  }

  ingest(stimulus: Stimulus, percept: Percept): void {
    this.store.ingest(stimulus, percept);
    this.scheduleSummary();
  }

  start(): void {
    if (this.state !== 'idle') {
      throw new Error('Nucleus has already started');
    }

    this.state = 'running';
    this.startedAt = Date.now();
    this.lastThinkAt = undefined;
    this.lastInputTokens = 0;
    this.dirty = false;
    this.unsubscribe = this.store.on('change', () => {
      this.dirty = true;
      this.schedule();
    });
    this.scheduleSummary();
    this.schedule();
  }

  async stop(): Promise<void> {
    if (this.state !== 'running') {
      throw new Error('Nucleus is not running');
    }

    this.state = 'stopping';
    this.clearTimer();
    this.clearSummaryTimer();
    this.unsubscribe?.();
    this.unsubscribe = undefined;

    try {
      await this.inFlight;
      await this.summaryInFlight;
      await this.summarizeMemory();
    } finally {
      this.store.clear();
      this.state = 'idle';
      this.dirty = false;
      this.lastThinkAt = undefined;
      this.lastInputTokens = 0;
    }
  }

  think(): Promise<TOutput> {
    return this.requestThink('manual');
  }

  async getContext(createdAt: Date = new Date()): Promise<NucleusContext> {
    return {
      ...this.store.snapshot(createdAt),
      definitions: this.context.definitions,
    };
  }

  private requestThink(trigger: NucleusTrigger): Promise<TOutput> {
    if (this.inFlight) {
      return this.inFlight;
    }
    if (this.summaryInFlight) {
      return this.summaryInFlight.then(() => this.requestThink(trigger));
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
      const [context, longTermMemory, recentMemory] = await Promise.all([
        this.getContext(),
        this.options.memory.readLongTerm(),
        this.options.memory.readRecent(),
      ]);
      const input: NucleusInput = { ...context, trigger };
      const longTerm = longTermMemory.trim() || '暂无长期记忆。';
      const recent = recentMemory.trim();
      const sections: ContextSection[] = [
        ...this.internalDefinitions(),
        {
          name: 'MEMORY',
          content: `${longTerm}\n\n${MEMORY_RULES}`,
        },
      ];
      const inputSections: ContextSection[] = [];
      if (recent) {
        inputSections.push({
          name: '最近经历',
          content: recent,
        });
      }
      const percepts = input.data.map(data => data.percept);
      const prompt = createContextPrompt(
        {
          trigger,
          sections,
          inputSections,
          percepts,
        },
        this.context,
      );
      const images = context.data.filter(entry => entry.content.type === 'image');
      let estimatedImageTokens = 0;
      if (images.length > 0) {
        estimatedImageTokens = await this.estimateImageTokens(images);
      }
      const result = await this.agent.generate({
        messages: await resolveNucleusMessages(input, this.options.messages, prompt),
        options: { input, prompt },
      });
      this.lastInputTokens = result.usage.inputTokens ?? estimatedImageTokens;
      const output = result.output as TOutput;
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
    if (this.lastInputTokens >= this.options.memorySummary.maxTokens) {
      this.requestSummary();
      return;
    }
    this.scheduleSummary();
    this.schedule();
  }

  private requestSummary(): void {
    if (this.inFlight || this.summaryInFlight || !this.store.active) {
      return;
    }
    this.clearTimer();
    this.clearSummaryTimer();
    const pending = this.summarizeMemory();
    this.summaryInFlight = pending;
    void pending.then(
      () => this.finishSummary(pending, true),
      error => {
        this.emit('error', toError(error));
        this.finishSummary(pending, false);
      },
    );
  }

  private async summarizeMemory(): Promise<void> {
    const snapshot = this.store.snapshot();
    if (snapshot.data.length === 0) {
      return;
    }
    const summary = await this.summarize(snapshot.data);
    if (summary) {
      const createdAt = new Date(Math.max(...snapshot.data.map(data => data.time.endAt.getTime())));
      await this.options.memory.appendEpisode(summary, createdAt);
    }
    this.store.remove(snapshot.data);
  }

  private async summarize(data: readonly ContextData[]): Promise<string> {
    const content: Array<TextPart | FilePart> = [];
    for (const entry of data) {
      const startAt = entry.time.startAt.toISOString();
      const endAt = entry.time.endAt.toISOString();
      let time = startAt;
      if (startAt !== endAt) {
        time = `${startAt} - ${endAt}`;
      }
      const header = `[${entry.scene.name} / ${entry.signal.name}]\n[${time}]`;
      if (entry.content.type === 'text') {
        let speaker = '';
        if (entry.content.speaker) {
          speaker = `[${entry.content.speaker}] `;
        }
        content.push({
          type: 'text',
          text: `${header} ${speaker}${entry.content.text}`,
        });
      } else {
        content.push({
          type: 'text',
          text: header,
        });
        content.push(await resolveImagePart(entry.content.path));
      }
    }

    const result = await generateText({
      model: this.options.model,
      system: '将这段经历总结为简洁、客观、过去时的纯文本。只记录实际发生的事情，不推测。',
      messages: [{ role: 'user', content }],
    });
    return result.text.trim();
  }

  private async estimateImageTokens(data: readonly ContextData[]): Promise<number> {
    let total = 0;
    for (const entry of data) {
      if (entry.content.type !== 'image') {
        continue;
      }
      try {
        total += await estimateImageTokens(entry.content.path);
      } catch {
        // 图片无法读取时由 API 的实际 token 用量兜底。
      }
    }
    return total;
  }

  private finishSummary(pending: Promise<void>, rescheduleSummary: boolean): void {
    if (this.summaryInFlight !== pending) {
      return;
    }
    this.summaryInFlight = undefined;
    if (rescheduleSummary) {
      this.scheduleSummary();
    }
    this.schedule();
  }

  private schedule(): void {
    if (this.state !== 'running' || this.inFlight || this.summaryInFlight) {
      return;
    }

    this.clearTimer();
    const now = Date.now();
    const anchor = this.lastThinkAt ?? this.startedAt;
    let dueAt = anchor + this.options.maxThinkInterval;
    if (this.dirty && this.lastThinkAt === undefined) {
      dueAt = now;
    } else if (this.dirty) {
      dueAt = anchor + this.options.minThinkInterval;
    }

    this.timer = setTimeout(
      () => {
        this.timer = undefined;
        let trigger: NucleusTrigger = 'interval';
        if (this.dirty) {
          trigger = 'percept';
        }
        void this.requestThink(trigger).catch(() => undefined);
      },
      Math.max(0, dueAt - now),
    );
  }

  private scheduleSummary(): void {
    this.clearSummaryTimer();
    if (this.state !== 'running' || !this.store.active || this.summaryInFlight) {
      return;
    }
    const lastIngestAt = this.store.lastIngestAt;
    if (lastIngestAt === undefined) {
      return;
    }
    const dueAt = lastIngestAt + this.options.memorySummary.idleTimeout;
    this.summaryTimer = setTimeout(
      () => {
        this.summaryTimer = undefined;
        this.requestSummary();
      },
      Math.max(0, dueAt - Date.now()),
    );
  }

  private clearTimer(): void {
    if (this.timer === undefined) {
      return;
    }
    clearTimeout(this.timer);
    this.timer = undefined;
  }

  private clearSummaryTimer(): void {
    if (this.summaryTimer === undefined) {
      return;
    }
    clearTimeout(this.summaryTimer);
    this.summaryTimer = undefined;
  }
}
