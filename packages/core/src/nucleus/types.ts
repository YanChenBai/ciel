import type { LanguageModel, ModelMessage, Output, ToolLoopAgentSettings, ToolSet } from 'ai';

import type {
  ContextDefinition,
  ContextPrompt,
  ContextPromptPart,
  ContextSection,
  ContextTrigger,
} from '#src/context/index.ts';
import type { CielMemoryStore } from '#src/memory/index.ts';
import type { EpisodeAgentInput, MemoryAgent } from '#src/memory/index.ts';
import type { VestigiumContent, VestigiumRecord, VestigiumStore } from '#src/vestigium/index.ts';

type MaybePromise<T> = T | Promise<T>;

export type NucleusTrigger = ContextTrigger;
export type NucleusTriggerMode = 'immediate' | 'scheduled' | 'passive';
export type NucleusTriggerPolicy = (record: VestigiumRecord) => NucleusTriggerMode;

export interface NucleusContextOptions {
  readonly perceptWindow?: number;

  /** 单轮最多提交的视觉变化帧拼图数量，每张最多包含九帧。 */
  readonly maxImages?: number;
}

export interface NucleusMemorySummaryOptions {
  readonly idleTimeout?: number;
  readonly maxTokens?: number;
}

export interface NucleusMemoryAgentsOptions {
  readonly episode?: MemoryAgent<EpisodeAgentInput, string>;
}

export type ContextContent = VestigiumContent;
export type ContextData = VestigiumRecord;

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
  readonly memoryAgents?: NucleusMemoryAgentsOptions;
  readonly memorySummary?: NucleusMemorySummaryOptions;
  readonly minThinkInterval?: number;
  readonly maxThinkInterval?: number;
  /** 决定一条新痕迹是否立即、按节流规则或仅被动进入下一轮上下文。 */
  readonly triggerPolicy?: NucleusTriggerPolicy;
  /** 可注入共享的感知记录层；Ciel 默认会为所有感官创建一个。 */
  readonly vestigium?: VestigiumStore;
}

export interface NucleusEventMap<TOutput = string> {
  thought(output: TOutput, input: NucleusInput): void;
  error(error: Error): void;
}

export type NucleusInternalDefinitions = () => readonly ContextSection[];

export type { ContextDefinition, ContextDefinitionKind, ContextTime } from '#src/context/index.ts';
