// @env node

import { generateText } from 'ai';
import type { FilePart, LanguageModel, TextPart } from 'ai';
import sharp from 'sharp';

import type { Memory } from '#src/memory/index.ts';

import { resolveImagePart } from './image.ts';
import type { ContextData, NucleusEpisodeOptions } from './types.ts';

export interface EpisodeStepTrace {
  readonly text?: string;
  readonly toolCalls: readonly unknown[];
  readonly toolResults: readonly unknown[];
}

export interface EpisodeRunTrace {
  readonly output: unknown;
  readonly steps: readonly EpisodeStepTrace[];
  readonly inputTokens?: number;
}

interface EpisodeBatch {
  readonly data: ContextData[];
  readonly lastIngestAt: number;
  readonly runs: EpisodeRunTrace[];
}

function formatTime(data: ContextData): string {
  const startAt = data.time.startAt.toISOString();
  const endAt = data.time.endAt.toISOString();
  return startAt === endAt ? startAt : `${startAt} - ${endAt}`;
}

function stringify(value: unknown): string {
  if (typeof value === 'string') return value;
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

function selectEvenly<T>(values: readonly T[], limit: number): T[] {
  if (limit <= 0) return [];
  if (values.length <= limit) return [...values];
  if (limit === 1) return [values.at(-1)!];
  return Array.from({ length: limit }, (_, index) => {
    const position = Math.round((index * (values.length - 1)) / (limit - 1));
    return values[position]!;
  });
}

/** 将一段连续实时经历压缩为可召回的情景记忆。 */
export class EpisodeRecorder {
  private data: ContextData[] = [];
  private runs: EpisodeRunTrace[] = [];
  private lastIngestAt?: number;
  private flushing: Promise<void> = Promise.resolve();
  private inputPressure = false;

  constructor(
    private readonly memory: Memory,
    private readonly model: LanguageModel,
    private readonly options: Required<NucleusEpisodeOptions>,
  ) {}

  get active(): boolean {
    return this.data.length > 0;
  }

  get dueAt(): number | undefined {
    return this.lastIngestAt === undefined
      ? undefined
      : this.lastIngestAt + this.options.idleTimeout;
  }

  get pressured(): boolean {
    const imageCount = this.data.filter(data => data.content.type === 'image').length;
    return (
      imageCount >= this.options.maxBufferedImages ||
      this.textChars >= this.options.maxTextChars ||
      this.inputPressure
    );
  }

  ingest(data: ContextData): void {
    this.data.push(data);
    this.lastIngestAt = Date.now();
  }

  recordRun(run: EpisodeRunTrace): void {
    if (!this.active) return;
    this.runs.push(run);
    if (run.inputTokens !== undefined && run.inputTokens >= this.options.maxInputTokens) {
      this.inputPressure = true;
    }
  }

  flush(): Promise<readonly ContextData[]> {
    if (!this.active) return this.flushing.then(() => []);
    const batch: EpisodeBatch = {
      data: this.data,
      lastIngestAt: this.lastIngestAt ?? Date.now(),
      runs: this.runs,
    };
    this.data = [];
    this.runs = [];
    this.lastIngestAt = undefined;
    this.inputPressure = false;
    const operation = this.flushing
      .then(async () => {
        await this.summarize(batch);
        return batch.data;
      })
      .catch(error => {
        this.data.unshift(...batch.data);
        this.runs.unshift(...batch.runs);
        this.lastIngestAt ??= batch.lastIngestAt;
        this.inputPressure ||= batch.runs.some(
          run => run.inputTokens !== undefined && run.inputTokens >= this.options.maxInputTokens,
        );
        throw error;
      });
    this.flushing = operation.then(
      () => undefined,
      () => undefined,
    );
    return operation;
  }

  private get textChars(): number {
    const observations = this.data.reduce(
      (total, data) => total + (data.content.type === 'text' ? data.content.text.length : 0),
      0,
    );
    return observations + this.runs.reduce((total, run) => total + stringify(run).length, 0);
  }

  private async summarize(batch: EpisodeBatch): Promise<void> {
    const textData = batch.data.filter(data => data.content.type === 'text');
    const imageData = await this.selectValidImages(
      batch.data.filter(data => data.content.type === 'image'),
    );
    if (textData.length === 0 && imageData.length === 0) return;

    const content: Array<TextPart | FilePart> = [];
    const observations = textData.map(data => {
      const speaker =
        data.content.type === 'text' && data.content.speaker ? `[${data.content.speaker}] ` : '';
      return `[${data.scene.name} / ${data.signal.name}]\n[${formatTime(data)}] ${speaker}${data.content.type === 'text' ? data.content.text : ''}`;
    });
    const runs = batch.runs.map((run, index) => {
      const steps = run.steps.map(step => ({
        ...(step.text ? { text: step.text } : {}),
        toolCalls: step.toolCalls,
        toolResults: step.toolResults,
      }));
      return `运行 ${index + 1}: ${stringify({ output: run.output, steps })}`;
    });
    content.push({
      type: 'text',
      text: [
        '# 实时观察',
        ...(observations.length > 0 ? observations : ['仅包含视觉观察。']),
        ...(runs.length > 0 ? ['# Nucleus 运行轨迹', ...runs] : []),
      ].join('\n\n'),
    });
    for (const data of imageData) {
      if (data.content.type !== 'image') continue;
      content.push({
        type: 'text',
        text: `[${data.scene.name} / ${data.signal.name}]\n[${formatTime(data)}]`,
      });
      content.push(await resolveImagePart(data.content.path));
    }

    const result = await generateText({
      model: this.model,
      system:
        '你负责把一段连续经历压缩为简洁、客观、过去时的情景记忆。结合画面、文字、听觉和工具轨迹，只记录实际发生的内容与结果，不推测，不输出标题。',
      messages: [{ role: 'user', content }],
    });
    const summary = result.text.trim();
    if (!summary) return;

    const startAt = new Date(Math.min(...batch.data.map(data => data.time.startAt.getTime())));
    const endAt = new Date(Math.max(...batch.data.map(data => data.time.endAt.getTime())));
    await this.memory.rememberEpisode({
      name: '情景',
      description: 'Nucleus 根据连续实时感知与行动轨迹生成的情景摘要',
      time: { startAt, endAt },
      content: { type: 'text', text: summary },
    });
  }

  private async selectValidImages(images: readonly ContextData[]): Promise<ContextData[]> {
    const unique = [
      ...new Map(
        images.map(data => [data.content.type === 'image' ? data.content.path : '', data]),
      ).values(),
    ];
    const valid: ContextData[] = [];
    for (const data of unique) {
      if (data.content.type !== 'image') continue;
      try {
        const stats = await sharp(data.content.path).stats();
        if (stats.entropy >= this.options.minVisualEntropy) valid.push(data);
      } catch {
        // 损坏或已经被清理的视觉文件不应阻断整段 Episode 的记忆生成。
      }
    }
    return selectEvenly(valid, this.options.maxImages);
  }
}
