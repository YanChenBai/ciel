import type { LanguageModel, Output, ToolLoopAgentSettings, ToolSet } from 'ai';

import type { ContextInput, ContextMessage, ContextTrigger } from '#context';
import type { CielMemoryStore } from '#memory';
import type { PerceptStore } from '#percepts';

export interface NucleusContextOptions {
  readonly perceptWindow?: number;

  /** 单轮最多提交的视觉变化帧拼图数量，每张最多包含九帧。 */
  readonly maxImages?: number;
}

export interface NucleusMemorySummaryOptions {
  readonly idleTimeout?: number;
  readonly maxTokens?: number;
}

export interface NucleusGenerationOptions<TOutput = string> {
  readonly model: LanguageModel;
  readonly system?: readonly string[];
  readonly messages?: readonly ContextMessage[];
  readonly tools?: ToolSet;
  readonly output?: Output.Output<TOutput>;
  readonly prepareStep?: ToolLoopAgentSettings<never, ToolSet>['prepareStep'];
  readonly stopWhen?: ToolLoopAgentSettings<never, ToolSet>['stopWhen'];
}

export interface NucleusThinkOptions<TOutput> {
  /** Vigilia 中用于识别这次主动思考的稳定名称。 */
  readonly name: string;
  /** 本次思考的任务输入；字符串会作为 user message 注入。 */
  readonly prompt: string | ContextMessage;
  /** 在 Ciel 内部人格、场景定义和记忆之后注入的本次任务指令。 */
  readonly system?: readonly string[];
  /** 本次思考独立的结构化输出契约。 */
  readonly output: Output.Output<TOutput>;
  readonly tools?: ToolSet;
  readonly prepareStep?: ToolLoopAgentSettings<never, ToolSet>['prepareStep'];
  readonly stopWhen?: ToolLoopAgentSettings<never, ToolSet>['stopWhen'];
}

export interface NucleusOptions<TOutput = string> extends NucleusGenerationOptions<TOutput> {
  /** 认知主体的身份定义；作为内部 system 内容注入 Context。 */
  readonly identity?: string;
  /** 认知主体的内在特质；作为内部 system 内容注入 Context。 */
  readonly soul?: string;
  /** 认知主体的行为与工作方式；作为内部 system 内容注入 Context。 */
  readonly agent?: string;
  readonly context?: NucleusContextOptions;
  readonly memory: CielMemoryStore;
  readonly memorySummary?: NucleusMemorySummaryOptions;
  readonly minThinkInterval?: number;
  readonly maxThinkInterval?: number;
  /** 可注入共享的感知存储；Ciel 默认会为所有感官创建内存实现。 */
  readonly perceptStore?: PerceptStore;
}

export interface NucleusEventMap<TOutput = string> {
  thought(output: TOutput, input: ContextInput): void;
  error(error: Error): void;
}

export interface NucleusThinkStarted {
  readonly fromSequence: number;
  readonly operationId: string;
  readonly name?: string;
  readonly startedAt: number;
  readonly throughSequence: number;
  readonly trigger: ContextTrigger;
}

export interface NucleusThinkCompleted<TOutput> extends NucleusThinkStarted {
  readonly durationMs: number;
  readonly inputTokens?: number;
  readonly output: TOutput;
  readonly outputTokens?: number;
  readonly reasoning?: string;
}

export interface NucleusThinkFailed extends NucleusThinkStarted {
  readonly durationMs: number;
  readonly error: Error;
}
