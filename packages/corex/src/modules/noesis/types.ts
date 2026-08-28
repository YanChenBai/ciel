import type { CueListener } from '#model/cue/index.ts';
import type { EngramEntry, EngramReader } from '#model/engram/index.ts';
import type {
  AnyProjection,
  Projection,
  ProjectionResult,
  ProjectorMap,
} from '#modules/projection/index.ts';
import type { CielModule } from '#modules/types.ts';
import type { MaybePromise, OnDispose } from '#shared/async.ts';
import type { CielMetadata } from '#shared/metadata.ts';

export type NoesisProjection = AnyProjection | undefined;

export type NoesisProjectionResult<TProjection extends NoesisProjection> =
  TProjection extends Projection<infer TProjectors extends ProjectorMap>
    ? ProjectionResult<TProjectors>
    : Record<never, never>;

export type NoesisProject<TProjection extends NoesisProjection> = (
  entries: readonly EngramEntry[],
) => Promise<NoesisProjectionResult<TProjection>>;

export type NoesisProjectRecent<TProjection extends NoesisProjection> = (
  durationMs?: number,
) => Promise<NoesisProjectionResult<TProjection>>;

export interface NoesisSetupContext<
  TProjection extends NoesisProjection = NoesisProjection,
> extends CueListener {
  /**
   * 只读访问已经形成的感知印记
   */
  readonly engram: EngramReader;
  /**
   * 使用当前 Noesis 声明的 Projection 投影一组 Engram 条目
   */
  project: NoesisProject<TProjection>;
  /**
   * 使用当前 Noesis 声明的 Projection 投影最近的 Engram 条目
   */
  projectRecent: NoesisProjectRecent<TProjection>;
  onDispose: OnDispose;
}

export interface DefineNoesisOptions<
  TProjection extends NoesisProjection = undefined,
> extends CielMetadata {
  /**
   * 当前 Noesis 使用的已注册 Projection
   */
  readonly projection?: TProjection;
  setup(this: void, ctx: NoesisSetupContext<TProjection>): MaybePromise<void>;
}

export interface Noesis<TProjection extends NoesisProjection = undefined>
  extends DefineNoesisOptions<TProjection>, CielModule<'noesis'> {}

export type AnyNoesis = Noesis<any>;
