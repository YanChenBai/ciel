import type { LanguageModel, ModelMessage, Output, ToolLoopAgentSettings, ToolSet } from 'ai';

import type {
  ContextDefinition,
  ContextPrompt,
  ContextPromptPart,
  ContextTime,
  ContextTrigger,
} from '#src/context/index.ts';
import type { MemoryEntry, MemoryOptions } from '#src/memory/index.ts';
import type { Percept } from '#src/percepts/index.ts';
import type { Stimulus } from '#src/stimulus/index.ts';

type MaybePromise<T> = T | Promise<T>;

export type NucleusTrigger = ContextTrigger;

export interface NucleusContextOptions {
  /** 每次组装 Context 时保留的最近感知时长，单位为毫秒。 */
  perceptWindow?: number;

  /** 单次模型输入最多携带多少张最近的实时图片。 */
  maxImages?: number;
}

export interface ContextTextContent {
  readonly type: 'text';
  readonly text: string;
  readonly speaker?: string;
}

export interface ContextImageContent {
  readonly type: 'image';
  readonly path: string;
}

export type ContextContent = ContextTextContent | ContextImageContent;

export interface ContextData {
  readonly stimulus: Stimulus;
  readonly scene: ContextDefinition;
  readonly signal: ContextDefinition;
  readonly time: ContextTime;
  readonly content: ContextContent;
  readonly percept: Percept;
}

/** Nucleus 中尚未加入 Memory 的实时状态。 */
export interface NucleusContextSnapshot {
  readonly createdAt: Date;
  readonly definitions: readonly ContextDefinition[];
  readonly data: readonly ContextData[];
}

/** Nucleus 当前可用于思考的完整实时数据与记忆。 */
export interface NucleusContext extends NucleusContextSnapshot {
  readonly memories: readonly MemoryEntry[];
  readonly memoryInstructions?: string;
}

/** Nucleus 一次思考所需的完整输入。 */
export interface NucleusInput extends NucleusContext {
  readonly trigger: NucleusTrigger;
}

export type NucleusPromptPart = ContextPromptPart;

export type NucleusPrompt = ContextPrompt;

/** 可在实时感知消息之后追加的 AI SDK 消息。 */
export type NucleusMessage = (
  input: NucleusInput,
) => MaybePromise<ModelMessage | readonly ModelMessage[]>;

/** Nucleus 内置 Memory 的配置，模型始终与 Nucleus 共用。 */
export type NucleusMemoryOptions = Omit<MemoryOptions, 'model'> & {
  readonly longTermLimit?: number;
  readonly episodicLimit?: number;
  readonly episode?: NucleusEpisodeOptions;
};

export interface NucleusEpisodeOptions {
  /** 最后一条 Percept 后多久自动结束 Episode。 */
  readonly idleTimeout?: number;
  /** 摘要最多使用多少张有效 Sight 拼图。 */
  readonly maxImages?: number;
  /** 缓存达到多少张 Sight 时，在本轮思考后结束 Episode。 */
  readonly maxBufferedImages?: number;
  /** 缓存的文字与运行轨迹达到多少字符时结束 Episode。 */
  readonly maxTextChars?: number;
  /** 单轮模型实际输入达到多少 token 时结束 Episode。 */
  readonly maxInputTokens?: number;
  /** Sight 灰度熵低于该值时视为没有有效画面内容。 */
  readonly minVisualEntropy?: number;
}

/** Nucleus 的模型与调用配置。 */
export interface NucleusGenerationOptions<TOutput = string> {
  readonly model: LanguageModel;
  readonly system?: readonly string[];
  readonly messages?: readonly NucleusMessage[];
  readonly tools?: ToolSet;
  readonly output?: Output.Output<TOutput>;
  readonly stopWhen?: ToolLoopAgentSettings<never, ToolSet>['stopWhen'];
}

/** Nucleus 的 Context、Memory 与调度配置。 */
export interface NucleusOptions<TOutput = string> extends NucleusGenerationOptions<TOutput> {
  readonly context?: NucleusContextOptions;
  readonly memory: NucleusMemoryOptions;
  readonly minThinkInterval?: number;
  readonly maxThinkInterval?: number;
}

export interface NucleusEventMap<TOutput = string> {
  thought(output: TOutput, input: NucleusInput): void;
  error(error: Error): void;
}

export type { ContextDefinition, ContextDefinitionKind, ContextTime } from '#src/context/index.ts';
