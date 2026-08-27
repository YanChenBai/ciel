import { createId } from '../utils/index.ts';
import type { DefineProjectorOptions, Projector } from './types.ts';

export type {
  AnyProjector,
  DefineProjectorOptions,
  Projector,
  ProjectorContext,
  ProjectorMap,
  ProjectorOutput,
} from './types.ts';

/**
 * 定义可被多个 Projection 复用的上下文投影器
 */
export function defineProjector<TResult>(
  options: DefineProjectorOptions<TResult>,
): Projector<TResult> {
  return {
    ...options,
    id: createId(),
  };
}
