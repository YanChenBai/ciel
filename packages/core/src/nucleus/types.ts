import type { LanguageModel, ModelMessage, Output, ToolLoopAgentSettings, ToolSet } from 'ai';

import type { ContextPromptProfile, ContextSnapshot, ContextSource } from '#src/context/index.ts';
import type { MemoryEntry, MemoryOptions } from '#src/memory/index.ts';

type MaybePromise<T> = T | Promise<T>;

export type NucleusTrigger = 'manual' | 'percept' | 'interval';

/**
 * Nucleus 一次思考所需的完整输入。
 */
export interface NucleusInput {
  /**
   * 本次思考由手动调用、新感知或最大等待时间触发。
   */
  readonly trigger: NucleusTrigger;

  /**
   * 当前感知窗口的不可变快照。
   */
  readonly context: ContextSnapshot;

  /**
   * 已按类型和配置限制数量的长期记忆与情景记忆。
   */
  readonly memories: readonly MemoryEntry[];

  /**
   * Memory 生成、应放入 system prompt 的长期上下文。
   */
  readonly memoryInstructions?: string;
}

/**
 * 可在实时感知消息之后追加的 AI SDK 消息。
 */
export type NucleusMessage = (
  input: NucleusInput,
) => MaybePromise<ModelMessage | readonly ModelMessage[]>;

/**
 * Nucleus 内置 Memory 的配置，模型始终与 Agent 共用。
 */
export type NucleusMemoryOptions = Omit<MemoryOptions, 'model'> & {
  /**
   * 每轮最多注入的长期记忆数量。
   */
  longTermLimit?: number;

  /**
   * 每轮最多注入的近期情景记忆数量。
   */
  episodicLimit?: number;
};

/**
 * Nucleus 的调度与依赖配置。
 */
export interface NucleusOptions<TOutput = string> {
  /**
   * Ciel 汇总后的上下文来源。
   */
  context: ContextSource;

  /**
   * 内置 ToolLoopAgent 使用的模型。
   */
  model: LanguageModel;

  /**
   * 由 Context 分区组合的身份、人格、规则与扩展提示词。
   */
  prompt?: ContextPromptProfile;

  /**
   * 在实时感知之后追加的本轮消息。
   */
  messages?: readonly NucleusMessage[];

  /**
   * 应用提供的行动工具；记忆工具由 Nucleus 自动加入。
   */
  tools?: ToolSet;

  /**
   * 可选的结构化输出定义；未提供时输出文本。
   */
  output?: Output.Output<TOutput>;

  /**
   * ToolLoopAgent 的停止条件。
   */
  stopWhen?: ToolLoopAgentSettings<never, ToolSet>['stopWhen'];

  /**
   * 启用并配置内置 Memory；未提供时不启用记忆。
   */
  memory?: NucleusMemoryOptions;

  /**
   * 新感知连续到达时，两次思考之间的最短间隔。
   */
  minThinkInterval?: number;

  /**
   * 没有新感知时，触发主动思考的最长等待时间。
   */
  maxThinkInterval?: number;
}

export interface NucleusEventMap<TOutput = string> {
  /**
   * 一次思考成功完成。
   */
  thought(output: TOutput, input: NucleusInput): void;

  /**
   * 召回或思考失败。
   */
  error(error: Error): void;
}
