import type { LLMContext } from '#model/llm/index.ts';

import { definePlugin } from './plugin.ts';
import type { Projector, ProjectorOptions } from './types.ts';

const createProjector = definePlugin((options: ProjectorOptions) => ({
  ...options,
  projectors: [options],
}));

/**
 * 定义一个向 Agent 上下文贡献具名投影结果的 Ciel Plugin。
 */
export function defineProjector<TResult extends LLMContext>(
  options: ProjectorOptions<TResult>,
): Projector<TResult> {
  return createProjector(options) as Projector<TResult>;
}
