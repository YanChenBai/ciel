import type { CielModule, ModuleType } from '#modules/types.ts';
import type { CielMetadata } from '#shared/metadata.ts';

import type { ProjectorMap, ProjectorOutput } from './projector/index.ts';

export interface DefineProjectionOptions<TProjectors extends ProjectorMap> extends CielMetadata {
  readonly projectors: TProjectors;
}

export interface Projection<TProjectors extends ProjectorMap = ProjectorMap>
  extends DefineProjectionOptions<TProjectors>, CielModule<typeof ModuleType.Projection> {}

export type AnyProjection = Projection<ProjectorMap>;

export type ProjectionResult<TProjectors extends ProjectorMap> = {
  readonly [TKey in keyof TProjectors]: ProjectorOutput<TProjectors[TKey]>;
};
