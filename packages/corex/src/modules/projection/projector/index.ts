import type { LLMContext } from '#model/llm/index.ts';
import { createId } from '#shared/id.ts';

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
export function defineProjector<TResult extends LLMContext>(
  options: DefineProjectorOptions<TResult>,
): Projector<TResult> {
  return {
    ...options,
    id: createId(),
  };
}
