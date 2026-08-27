import type { ProjectorMap } from '../projector/index.ts';
import { ModuleType } from '../types/index.ts';
import { createId } from '../utils/index.ts';
import type { DefineProjectionOptions, Projection } from './types.ts';

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
