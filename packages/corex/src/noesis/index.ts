import type { CueListener } from '../ciel/event-bus/index.ts';
import type { EngramEntry, EngramReader } from '../engram/index.ts';
import type { AnyProjection, Projection, ProjectionResult } from '../projection/index.ts';
import type { ProjectorMap } from '../projector/index.ts';
import {
  type CielMetadata,
  type CielModule,
  type Dispose,
  type MaybePromise,
  ModuleType,
} from '../types/index.ts';
import { createId } from '../utils/index.ts';

export type NoesisProjection = AnyProjection | undefined;

export type NoesisProjectionResult<TProjection extends NoesisProjection> =
  TProjection extends Projection<infer TProjectors extends ProjectorMap>
    ? ProjectionResult<TProjectors>
    : Record<never, never>;

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
  project(entries: readonly EngramEntry[]): Promise<NoesisProjectionResult<TProjection>>;

  onDispose(dispose: Dispose): void;
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
  extends DefineNoesisOptions<TProjection>, CielModule<typeof ModuleType.Noesis> {}

export type AnyNoesis = Noesis<any>;

export function defineNoesis<TProjection extends NoesisProjection = undefined>(
  options: DefineNoesisOptions<TProjection>,
): Noesis<TProjection> {
  return {
    ...options,
    type: ModuleType.Noesis,
    id: createId(),
  };
}
