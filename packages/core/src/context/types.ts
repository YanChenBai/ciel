import type { ModelMessage } from 'ai';

import type { PerceptRecord } from '#src/percepts/index.ts';

type MaybePromise<T> = T | Promise<T>;

export type ContextDefinitionKind = 'stimulus' | 'signal';

export interface ContextDefinition {
  readonly kind: ContextDefinitionKind;
  readonly name: string;
  readonly description: string;
}

export interface ContextTime {
  readonly startAt: Date;
  readonly endAt: Date;
}

export type ContextTrigger = 'manual' | 'speech-end' | 'interval';

/** 对外可观察的原始上下文快照，不包含任何模型提示词。 */
export interface ContextSnapshot {
  readonly createdAt: Date;
  readonly definitions: readonly ContextDefinition[];
  readonly data: readonly PerceptRecord[];
}

export interface ContextInput extends ContextSnapshot {
  readonly trigger: ContextTrigger;
}

export type ContextMessage = (
  input: ContextInput,
) => MaybePromise<ModelMessage | readonly ModelMessage[]>;

/** Context 唯一对模型暴露的最终输入。 */
export interface ModelContext {
  readonly system: string;
  readonly messages: readonly ModelMessage[];
}

export interface ContextBuildInput {
  readonly input: ContextInput;
  readonly internalSystem?: readonly string[];
  readonly longTermMemory: string;
  readonly recentMemory?: string;
  readonly system?: readonly string[];
  readonly messages?: readonly ContextMessage[];
}
