import { Output, ToolLoopAgent } from 'ai';
import type { ToolSet } from 'ai';

import { createMemoryTools } from '#src/memory/agent-tool.ts';
import type { Memory } from '#src/memory/index.ts';

import type { NucleusGenerationOptions, NucleusInput, NucleusPrompt } from './types.ts';

interface NucleusCallOptions {
  readonly [key: string]: unknown;
  readonly input: NucleusInput;
  readonly prompt: NucleusPrompt;
}

export type NucleusToolLoopAgent<TOutput> = ToolLoopAgent<
  NucleusCallOptions,
  ToolSet,
  Record<string, unknown>,
  Output.Output<TOutput>
>;

/**
 * 使用固定 Memory 与 Agent 配置创建 Nucleus 独占的 ToolLoopAgent。
 */
export function createNucleusToolLoopAgent<TOutput>(
  memory: Memory,
  options: NucleusGenerationOptions<TOutput>,
): NucleusToolLoopAgent<TOutput> {
  const tools = options.tools ?? {};

  return new ToolLoopAgent<
    NucleusCallOptions,
    ToolSet,
    Record<string, unknown>,
    Output.Output<TOutput>
  >({
    model: options.model,
    tools,
    output: (options.output ?? Output.text()) as Output.Output<TOutput>,
    ...(options.stopWhen ? { stopWhen: options.stopWhen } : {}),
    prepareCall: ({ options: call, ...settings }) => ({
      ...settings,
      instructions: [
        ...call.prompt.system.map(content => ({ role: 'system' as const, content })),
        ...(options.system?.map(content => ({ role: 'system' as const, content })) ?? []),
      ],
      tools: { ...tools, ...createMemoryTools(memory) },
    }),
  });
}
