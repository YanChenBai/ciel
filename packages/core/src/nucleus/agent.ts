import { Output, ToolLoopAgent } from 'ai';
import type { ToolSet } from 'ai';

import type { ContextInput, ModelContext } from '#context';
import { createMemoryTools } from '#memory/tool.ts';
import type { CielMemoryStore } from '#memory/types.ts';

import type { NucleusGenerationOptions } from './types.ts';

interface NucleusCallOptions {
  readonly [key: string]: unknown;
  readonly input: ContextInput;
  readonly context: ModelContext;
}

export type NucleusAgent<TOutput> = ToolLoopAgent<
  NucleusCallOptions,
  ToolSet,
  Record<string, unknown>,
  Output.Output<TOutput>
>;

/**
 * 将模型和工具装配集中在一个入口，避免默认思考与主动思考各自维护一套 Agent 配置。
 */
export function createNucleusAgent<TOutput>(
  options: NucleusGenerationOptions<TOutput>,
  memory: CielMemoryStore,
): NucleusAgent<TOutput> {
  const tools = options.tools ?? {};
  const memoryTools = createMemoryTools(memory);

  return new ToolLoopAgent<
    NucleusCallOptions,
    ToolSet,
    Record<string, unknown>,
    Output.Output<TOutput>
  >({
    model: options.model,
    tools,
    output: (options.output ?? Output.text()) as Output.Output<TOutput>,
    ...(options.prepareStep ? { prepareStep: options.prepareStep } : {}),
    ...(options.stopWhen ? { stopWhen: options.stopWhen } : {}),
    prepareCall: ({ options: call, ...settings }) => {
      return {
        ...settings,
        instructions: [{ role: 'system', content: call.context.system }],
        // 记忆能力属于所有思考的基础设施，由 Nucleus 统一注入而不是交给调用方重复声明。
        tools: {
          ...tools,
          ...memoryTools,
        },
      };
    },
  });
}
