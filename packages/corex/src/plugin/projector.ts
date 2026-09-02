import type { EngramView } from '#model/engram/index.ts';
import type { LLMContext } from '#model/llm/index.ts';
import type { MaybePromise } from '#shared/async.ts';
import type { CielMetadata } from '#shared/metadata.ts';

export interface ProjectorContext {
  readonly engram: EngramView;
}

export interface DefineProjectorOptions<
  TResult extends LLMContext = LLMContext,
> extends CielMetadata {
  project(this: void, context: ProjectorContext): MaybePromise<TResult>;
}

export interface Projector<TResult extends LLMContext = LLMContext> extends CielMetadata {
  readonly id: string;
  project(this: void, context: ProjectorContext): MaybePromise<TResult>;
}

export type AnyProjector = Projector<LLMContext>;
