import { definePlugin, type ResolvedCielConfig } from '@cieljs/core';

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
  let config: ResolvedCielConfig | undefined;
  const runtime = createMemory({
    ...options,
    id: () => options.id ?? config!.id,
    agent: () => ({
      ...config!.agent,
      ...options.agent,
      instructions: createMemoryInstructions(options.instructions),
      prompts: resolveMemoryPrompts(options.prompts),
    }),
  });

  return {
    name: options.name,
    description: options.description,
    instructions: MEMORY_PLUGIN_INSTRUCTIONS,
    projectors: [runtime.projector],
    tools: runtime.tools,
    configResolved(resolved: ResolvedCielConfig) {
      config = resolved;
    },
    initialize: () => runtime.start(),
    dispose: () => runtime.close(),
  };
});
