import type { EngramView } from '#model/engram/index.ts';
import type { LLMContext } from '#model/llm/index.ts';
import type { MaybePromise } from '#shared/async.ts';
import type { CielMetadata } from '#shared/metadata.ts';

export interface ProjectorContext {
  /**
   * 本次投影输入形成的只读 Engram 快照
   */
  readonly engram: EngramView;
}

export interface DefineProjectorOptions<
  TResult extends LLMContext = LLMContext,
> extends CielMetadata {
  project(this: void, ctx: ProjectorContext): MaybePromise<TResult>;
}

export interface Projector<
  TResult extends LLMContext = LLMContext,
> extends DefineProjectorOptions<TResult> {
  /**
   * Projector 的 UUIDv7 唯一标识
   */
  readonly id: string;
}

export type AnyProjector = Projector<LLMContext>;

export type ProjectorMap = Readonly<Record<string, AnyProjector>>;

export type ProjectorOutput<TProjector extends AnyProjector> = Awaited<
  ReturnType<TProjector['project']>
>;
