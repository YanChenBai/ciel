import type { EngramView } from '../engram/index.ts';
import type { CielMetadata, MaybePromise } from '../types/index.ts';

export interface ProjectorContext {
  /**
   * 本次投影输入形成的只读 Engram 快照
   */
  readonly engram: EngramView;
}

export interface DefineProjectorOptions<TResult> extends CielMetadata {
  project(this: void, ctx: ProjectorContext): MaybePromise<TResult>;
}

export interface Projector<TResult = unknown> extends DefineProjectorOptions<TResult> {
  /**
   * Projector 的 UUIDv7 唯一标识
   */
  readonly id: string;
}

export type AnyProjector = Projector<any>;

export type ProjectorMap = Readonly<Record<string, AnyProjector>>;

export type ProjectorOutput<TProjector extends AnyProjector> = Awaited<
  ReturnType<TProjector['project']>
>;
