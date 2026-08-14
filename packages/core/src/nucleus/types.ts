import type { LanguageModel, Output, ToolLoopAgentSettings, ToolSet } from 'ai';

import type { ContextInput, ContextMessage } from '#src/context/index.ts';
import type { CielMemoryStore } from '#src/memory/index.ts';
import type { PerceptStore } from '#src/percepts/index.ts';

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
