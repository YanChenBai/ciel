import { ModuleType } from '#modules/types.ts';
import { createId } from '#shared/id.ts';

import type { ProjectorMap } from './projector/index.ts';
import type { DefineProjectionOptions, Projection } from './types.ts';

export * from './projector/index.ts';
export type {
  AnyProjection,
  DefineProjectionOptions,
  Projection,
  ProjectionResult,
} from './types.ts';

/**
 * 定义由一组具名 Projector 组成的投影模块
 */
export function defineProjection<TProjectors extends ProjectorMap>(
  options: DefineProjectionOptions<TProjectors>,
): Projection<TProjectors> {
  return {
    ...options,
    type: ModuleType.Projection,
    id: createId(),
  };
}
