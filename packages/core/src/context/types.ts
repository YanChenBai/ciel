import type { Percept } from '#src/percepts/index.ts';

export type ContextDefinitionKind = 'scene' | 'signal';

export interface ContextDefinition {
  readonly kind: ContextDefinitionKind;
  readonly name: string;
  readonly description: string;
}

export interface ContextTime {
  readonly startAt: Date;
  readonly endAt: Date;
}

export type ContextPromptPart =
  | { readonly type: 'text'; readonly text: string }
  | { readonly type: 'image'; readonly path: string };

export type ContextTrigger = 'manual' | 'percept' | 'interval';

export interface ContextSection {
  readonly name: string;
  readonly content: string;
}

export interface ContextPromptInput {
  readonly trigger: ContextTrigger;
  readonly sections?: readonly ContextSection[];
  readonly inputSections?: readonly ContextSection[];
  readonly percepts: readonly Percept[];
}

export interface ContextPrompt {
  readonly system: readonly string[];
  readonly input: readonly ContextPromptPart[];
}
