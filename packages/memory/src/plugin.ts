import { definePlugin } from 'corex';

import { createMemoryInstructions, resolveMemoryPrompts } from './prompts.ts';
import { createMemory } from './runtime.ts';
import type { MemoryOptions } from './types.ts';

/**
 * 向 Corex 上下文安装一个隔离的记忆运行时
 */
export const memoryPlugin = definePlugin((options: MemoryOptions) => {
  return {
    name: options.name,
    description: options.description,

    setup(ctx) {
      const runtime = createMemory({
        ...options,
        id: options.id ?? ctx.id,
        agent: {
          ...ctx.agent,
          ...options.agent,
          instructions: createMemoryInstructions(options.instructions),
          prompts: resolveMemoryPrompts(options.prompts),
        },
      });

      ctx.provide({
        tools: runtime.tools,
        projectors: [runtime.projector],
      });

      // 运行时完成注册后由 Corex 管理生命周期
      ctx.onStart(() => runtime.start());
      ctx.onDispose(() => runtime.close());
    },
  };
});
