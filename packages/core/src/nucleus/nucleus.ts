import { EventHost, toError } from '@ciels/event';
import type { Unsubscribe } from '@ciels/event';
import { Output, ToolLoopAgent } from 'ai';
import type { FilePart, TextPart, ToolSet } from 'ai';

import { OculusComposer } from '#sensus';
import { Context, createContextPrompt } from '#src/context/index.ts';
import type { ContextSection } from '#src/context/index.ts';
import { summarizeEpisode } from '#src/memory/index.ts';
import type { EpisodeSummarizer } from '#src/memory/index.ts';
import { createMemoryTools } from '#src/memory/tool.ts';
import { InMemoryPerceptStore } from '#src/percepts/index.ts';
import type { Percept } from '#src/percepts/index.ts';
import type { PerceptCheckout, PerceptRecord, PerceptStore } from '#src/percepts/index.ts';
import type { Photon, SignalConstructor } from '#src/signals/index.ts';
import type { Stimulus } from '#src/stimulus/index.ts';
import { definePrompt } from '#utils';

import { VISION_FRAMES_PER_IMAGE } from './constants.ts';
import { estimateImageTokens, resolveImagePart } from './image.ts';
import { resolveNucleusMessages } from './messages.ts';
import { normalizeNucleusOptions } from './options.ts';
import type { NormalizedNucleusOptions } from './options.ts';
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

const MEMORY_RULES = definePrompt(`
当前上下文不足时，使用 memory_recall 按语义搜索历史经历。
发现新的稳定事实、偏好或经验时，使用 memory_update 提交精炼、去重后的完整全局记忆。
`);

const SUMMARY_RETRY_DELAY = 1_000;

interface VisionBatch {
  readonly data: readonly PerceptRecord[];
  readonly signal: SignalConstructor<Photon>;
  readonly stimulus: Stimulus;
}

/**
 * Ciel 的认知调度器，负责思考与记忆总结的触发时机。
 */
export class Nucleus<TOutput = string> extends EventHost<NucleusEventMap<TOutput>> {
  private readonly options: NormalizedNucleusOptions<TOutput>;
  private readonly signals: SignalConstructor[] = [];
  private readonly stimuli: Stimulus[] = [];
  private readonly context: Context;
  private readonly perceptStore: PerceptStore;
  private readonly agent: NucleusAgent<TOutput>;
  private readonly summarizeEpisode: EpisodeSummarizer;
  private readonly nucleusConsumer: string;
  private readonly memoryConsumer: string;
  private readonly sightComposer = new OculusComposer();
  private state: NucleusState = 'idle';
  private startedAt = 0;
  private lastThinkAt?: number;
  private lastInputTokens = 0;
  private speechEndPending = false;
  private timer?: ReturnType<typeof setTimeout>;
  private summaryTimer?: ReturnType<typeof setTimeout>;
  private inFlight?: Promise<TOutput>;
  private summaryInFlight?: Promise<void>;
  private summaryRetryAt?: number;
  private unsubscribe?: Unsubscribe;

  constructor(
    options: NucleusOptions<TOutput>,
    private readonly internalDefinitions: NucleusInternalDefinitions = () => [],
  ) {
    super();
    this.options = normalizeNucleusOptions(options);
    this.context = new Context(this.signals, this.stimuli);
    this.perceptStore = options.perceptStore ?? new InMemoryPerceptStore();
    this.nucleusConsumer = this.perceptStore.createConsumer('nucleus');
    this.memoryConsumer = this.perceptStore.createConsumer('memory');
    this.agent = this.createAgent();
    this.summarizeEpisode =
      options.summarizeEpisode ?? (input => summarizeEpisode(options.model, input));
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
    this.perceptStore.register(stimulus);
  }

  ingest(stimulus: Stimulus, percept: Percept): void {
    this.perceptStore.append(stimulus, percept);
    this.scheduleSummary();
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
    this.unsubscribe = this.perceptStore.on('append', () => {
      this.scheduleSummary();
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
      this.state = 'idle';
      this.speechEndPending = false;
      this.lastThinkAt = undefined;
      this.lastInputTokens = 0;
    }
  }

  think(): Promise<TOutput> {
    return this.requestThink('manual');
  }

  async getContext(createdAt: Date = new Date()): Promise<NucleusContext> {
    const records = this.perceptStore
      .snapshot(createdAt, this.options.context.perceptWindow)
      .records.toSorted(
        (left, right) =>
          left.time.startAt.getTime() - right.time.startAt.getTime() ||
          left.time.endAt.getTime() - right.time.endAt.getTime(),
      );
    const texts = records.filter(record => record.content.type === 'text');
    const images =
      this.options.context.maxImages === 0
        ? []
        : records
            .filter(record => record.content.type === 'image')
            .slice(-this.options.context.maxImages);
    const visible = new Set([...texts, ...images]);
    return {
      createdAt,
      data: records.filter(record => visible.has(record)),
      definitions: this.context.definitions,
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
    this.speechEndPending = false;
    try {
      const [checkout, longTermMemory, recentMemory] = await Promise.all([
        Promise.resolve(this.perceptStore.checkout(this.nucleusConsumer)),
        this.options.memory.readLongTerm(),
        this.options.memory.readRecent(),
      ]);
      const context = await this.resolveCheckout(checkout);
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
      this.perceptStore.commit(checkout);
      this.compactPerceptStore();
      this.lastInputTokens = result.usage.inputTokens ?? estimatedImageTokens;
      const output = result.output as TOutput;
      this.emit('thought', output, input);
      return output;
    } catch (error) {
      if (trigger === 'speech-end') this.speechEndPending = true;
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
    if (
      this.inFlight ||
      this.summaryInFlight ||
      !this.perceptStore.hasUnread(this.memoryConsumer)
    ) {
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
    const checkout = this.perceptStore.checkout(this.memoryConsumer);
    if (checkout.records.length === 0) {
      this.perceptStore.commit(checkout);
      return;
    }
    try {
      const data = await this.resolveArchiveData(checkout.records);
      if (data.length === 0) {
        this.perceptStore.commit(checkout);
        return;
      }
      const summary = await this.summarize(data);
      if (!summary) throw new Error('Episode summarizer returned an empty summary');
      const createdAt = new Date(Math.max(...data.map(entry => entry.time.endAt.getTime())));
      await this.options.memory.appendEpisode(
        summary,
        createdAt,
        `percept-store:${checkout.consumerId}:${checkout.fromSequence}-${checkout.throughSequence}`,
      );
      this.perceptStore.commit(checkout);
      this.summaryRetryAt = undefined;
      this.compactPerceptStore();
    } catch (error) {
      const normalized = toError(error);
      throw normalized;
    }
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

    return this.summarizeEpisode({ content });
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
    if (!rescheduleSummary) this.summaryRetryAt = Date.now() + SUMMARY_RETRY_DELAY;
    this.scheduleSummary();
    this.schedule();
  }

  private schedule(): void {
    if (this.state !== 'running' || this.inFlight) {
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
        const trigger: NucleusTrigger = this.speechEndPending ? 'speech-end' : 'interval';
        void this.requestThink(trigger).catch(() => undefined);
      },
      Math.max(0, dueAt - now),
    );
  }

  private scheduleSummary(): void {
    this.clearSummaryTimer();
    if (
      this.state !== 'running' ||
      !this.perceptStore.hasUnread(this.memoryConsumer) ||
      this.summaryInFlight
    ) {
      return;
    }
    const lastIngestAt = this.perceptStore.lastAppendAt;
    if (lastIngestAt === undefined) {
      return;
    }
    const dueAt = Math.max(
      lastIngestAt + this.options.memorySummary.idleTimeout,
      this.summaryRetryAt ?? -Infinity,
    );
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

  private async resolveCheckout(checkout: PerceptCheckout): Promise<NucleusContext> {
    const recent = this.perceptStore
      .snapshot(checkout.createdAt, this.options.context.perceptWindow)
      .records.filter(
        record => record.sequence <= checkout.throughSequence && record.content.type === 'text',
      );
    const batches = this.createVisionBatches(checkout.records);
    const resolvedImages = await Promise.all(
      batches.map(async batch => {
        const first = batch.data[0]!;
        const frames = batch.data.map(entry => {
          if (entry.percept.type !== 'sight') {
            throw new Error('Vision batches can only contain Sight percepts');
          }
          return entry.percept;
        });
        try {
          const sight = await this.sightComposer.compose(frames);
          return {
            ...first,
            time: {
              startAt: sight.startAt,
              endAt: sight.endAt,
            },
            content: {
              type: 'image' as const,
              path: sight.path,
            },
            percept: sight,
          };
        } catch {
          return undefined;
        }
      }),
    );
    const images = resolvedImages.filter(image => image !== undefined);
    const data = [...recent, ...images].toSorted(
      (left, right) =>
        left.time.startAt.getTime() - right.time.startAt.getTime() ||
        left.time.endAt.getTime() - right.time.endAt.getTime(),
    );
    return {
      createdAt: checkout.createdAt,
      data,
      definitions: this.context.definitions,
    };
  }

  private createVisionBatches(
    records: readonly PerceptRecord[],
    limit: number = this.options.context.maxImages,
  ): readonly VisionBatch[] {
    if (limit === 0) return [];

    const sources: Array<{
      data: PerceptRecord[];
      signal: SignalConstructor<Photon>;
      stimulus: Stimulus;
    }> = [];
    for (const record of records) {
      if (record.percept.type !== 'sight') continue;
      let source = sources.find(
        value => value.stimulus === record.stimulus && value.signal === record.percept.originSignal,
      );
      if (!source) {
        source = {
          data: [],
          signal: record.percept.originSignal,
          stimulus: record.stimulus,
        };
        sources.push(source);
      }
      source.data.push(record);
    }

    const batches = sources
      .flatMap(source => {
        const batches: VisionBatch[] = [];
        for (let index = 0; index < source.data.length; index += VISION_FRAMES_PER_IMAGE) {
          batches.push({
            signal: source.signal,
            stimulus: source.stimulus,
            data: source.data.slice(index, index + VISION_FRAMES_PER_IMAGE),
          });
        }
        return batches;
      })
      .toSorted(
        (left, right) =>
          left.data[0]!.time.startAt.getTime() - right.data[0]!.time.startAt.getTime(),
      );
    return this.selectVisionBatches(batches, limit);
  }

  /** 保留首尾并在时间线上均匀取样，避免长段视觉只剩最后几秒。 */
  private selectVisionBatches(
    batches: readonly VisionBatch[],
    limit: number,
  ): readonly VisionBatch[] {
    if (batches.length <= limit) return batches;
    if (limit === 1) return [batches.at(-1)!];

    const selected = new Set<number>();
    for (let index = 0; index < limit; index += 1) {
      selected.add(Math.round((index * (batches.length - 1)) / (limit - 1)));
    }
    return [...selected].map(index => batches[index]!);
  }

  private async resolveArchiveData(
    records: readonly PerceptRecord[],
  ): Promise<readonly PerceptRecord[]> {
    const texts = records.filter(record => record.content.type === 'text');
    const images = await Promise.all(
      this.createVisionBatches(records, Math.max(1, this.options.context.maxImages)).map(
        async batch => {
          const first = batch.data[0]!;
          try {
            const sight = await this.sightComposer.compose(
              batch.data.map(record => {
                if (record.percept.type !== 'sight') {
                  throw new Error('Vision batches can only contain Sight percepts');
                }
                return record.percept;
              }),
            );
            return {
              ...first,
              time: { startAt: sight.startAt, endAt: sight.endAt },
              content: { type: 'image' as const, path: sight.path },
              percept: sight,
            };
          } catch {
            return {
              ...first,
              content: {
                type: 'text' as const,
                text: `[视觉证据不可读取；PerceptStore sequence: ${batch.data
                  .map(record => record.sequence)
                  .join(', ')}]`,
              },
            };
          }
        },
      ),
    );
    return [...texts, ...images].toSorted(
      (left, right) =>
        left.time.startAt.getTime() - right.time.startAt.getTime() ||
        left.time.endAt.getTime() - right.time.endAt.getTime(),
    );
  }

  private compactPerceptStore(): void {
    this.perceptStore.compact(new Date(), this.options.context.perceptWindow);
  }
}
