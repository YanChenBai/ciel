import type { LanguageModel, ModelMessage, Output, ToolLoopAgentSettings, ToolSet } from 'ai';

import type {
  ContextDefinition,
  ContextPrompt,
  ContextPromptPart,
  ContextSection,
  ContextTime,
  ContextTrigger,
} from '#src/context/index.ts';
import type { Memory } from '#src/memory/index.ts';
import type { Percept } from '#src/percepts/index.ts';
import type { Stimulus } from '#src/stimulus/index.ts';

type MaybePromise<T> = T | Promise<T>;

export type NucleusTrigger = ContextTrigger;

export interface NucleusContextOptions {
  readonly perceptWindow?: number;
  readonly maxImages?: number;
}

export interface NucleusMemorySummaryOptions {
  readonly idleTimeout?: number;
  readonly maxTokens?: number;
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
  readonly memory: Memory;
  readonly memorySummary?: NucleusMemorySummaryOptions;
  readonly minThinkInterval?: number;
  readonly maxThinkInterval?: number;
}

export interface NucleusEventMap<TOutput = string> {
  thought(output: TOutput, input: NucleusInput): void;
  error(error: Error): void;
}

export type NucleusInternalDefinitions = () => readonly ContextSection[];

export type { ContextDefinition, ContextDefinitionKind, ContextTime } from '#src/context/index.ts';
