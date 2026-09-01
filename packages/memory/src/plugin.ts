import { definePlugin } from 'corex';
import type { PluginCreateContext } from 'corex';

import {
  createMemoryInstructions,
  MEMORY_PLUGIN_INSTRUCTIONS,
  resolveMemoryPrompts,
} from './prompts.ts';
import { createMemory } from './runtime.ts';
import type { MemoryOptions } from './types.ts';

/**
 * 向 Corex 上下文安装一个隔离的记忆运行时
 */
export const memoryPlugin = definePlugin((options: MemoryOptions) => {
  return {
    name: options.name,
    description: options.description,

    create(ctx: PluginCreateContext) {
      const runtime = createMemory({
        ...options,
        id: options.id ?? ctx.cielId,
        agent: {
          ...ctx.agent,
          ...options.agent,
          instructions: createMemoryInstructions(options.instructions),
          prompts: resolveMemoryPrompts(options.prompts),
        },
      });

      return {
        extensions: [runtime.projector],
        instructions: MEMORY_PLUGIN_INSTRUCTIONS,
        tools: runtime.tools,
        initialize: () => runtime.start(),
        dispose: () => runtime.close(),
      };
    },
  };
});
