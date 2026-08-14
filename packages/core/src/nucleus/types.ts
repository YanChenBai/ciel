import type { LanguageModel, ModelMessage, Output, ToolLoopAgentSettings, ToolSet } from 'ai';

import type {
  ContextDefinition,
  ContextPrompt,
  ContextPromptPart,
  ContextSection,
  ContextTrigger,
} from '#src/context/index.ts';
import type { CielMemoryStore } from '#src/memory/index.ts';
import type { EpisodeSummarizer } from '#src/memory/index.ts';
import type { PerceptRecord, PerceptStore, StoredPerceptContent } from '#src/percepts/index.ts';

type MaybePromise<T> = T | Promise<T>;

export type NucleusTrigger = ContextTrigger;
export interface NucleusContextOptions {
  readonly perceptWindow?: number;

  /** 单轮最多提交的视觉变化帧拼图数量，每张最多包含九帧。 */
  readonly maxImages?: number;
}

export interface NucleusMemorySummaryOptions {
  readonly idleTimeout?: number;
  readonly maxTokens?: number;
}

export type ContextContent = StoredPerceptContent;
export type ContextData = PerceptRecord;

export interface NucleusContext {
  readonly createdAt: Date;
  readonly definitions: readonly ContextDefinition[];
  readonly data: readonly ContextData[];
}

export interface NucleusInput extends NucleusContext {
  readonly trigger: NucleusTrigger;
}

export type NucleusPromptPart = ContextPromptPart;
export type NucleusPrompt = ContextPrompt;

export type NucleusMessage = (
  input: NucleusInput,
) => MaybePromise<ModelMessage | readonly ModelMessage[]>;

export interface NucleusGenerationOptions<TOutput = string> {
  readonly model: LanguageModel;
  readonly system?: readonly string[];
  readonly messages?: readonly NucleusMessage[];
  readonly tools?: ToolSet;
  readonly output?: Output.Output<TOutput>;
  readonly stopWhen?: ToolLoopAgentSettings<never, ToolSet>['stopWhen'];
}

export interface NucleusOptions<TOutput = string> extends NucleusGenerationOptions<TOutput> {
  readonly context?: NucleusContextOptions;
  readonly memory: CielMemoryStore;
  readonly memorySummary?: NucleusMemorySummaryOptions;
  readonly minThinkInterval?: number;
  readonly maxThinkInterval?: number;
  /** 自定义经历总结方法；默认使用主模型执行一次无工具总结。 */
  readonly summarizeEpisode?: EpisodeSummarizer;
  /** 可注入共享的感知存储；Ciel 默认会为所有感官创建内存实现。 */
  readonly perceptStore?: PerceptStore;
}

export interface NucleusEventMap<TOutput = string> {
  thought(output: TOutput, input: NucleusInput): void;
  error(error: Error): void;
}

export type NucleusInternalDefinitions = () => readonly ContextSection[];

export type { ContextDefinition, ContextDefinitionKind, ContextTime } from '#src/context/index.ts';
