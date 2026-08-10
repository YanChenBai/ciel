// @env node

import { readFile } from 'node:fs/promises';

import { Output, ToolLoopAgent } from 'ai';
import type { FilePart, ModelMessage, TextPart } from 'ai';

import { createContextPrompt } from '#src/context/index.ts';
import { createMemoryTools } from '#src/memory/agent-tool.ts';
import type { Memory } from '#src/memory/index.ts';

import type { NucleusInput, NucleusOptions } from './types.ts';

const TRIGGER_NAMES = {
  manual: '手动触发',
  percept: '感知更新',
  interval: '主动思考',
} as const;

async function resolveMessages<TOutput>(
  input: NucleusInput,
  options: NucleusOptions<TOutput>,
  prompt: ReturnType<typeof createContextPrompt>,
): Promise<ModelMessage[]> {
  const content: Array<TextPart | FilePart> = [];
  for (const part of prompt.input) {
    if (part.type === 'text') {
      content.push({ type: 'text', text: part.text });
    } else {
      content.push({ type: 'file', mediaType: 'image', data: await readFile(part.path) });
    }
  }

  const messages: ModelMessage[] = [{ role: 'user', content }];
  for (const source of options.messages ?? []) {
    const value = await source(input);
    messages.push(...(Array.isArray(value) ? value : [value]));
  }
  return messages;
}

function resolveTools<TOutput>(
  input: NucleusInput,
  options: NucleusOptions<TOutput>,
  memory?: Memory,
) {
  const tools = options.tools ?? {};
  if ('memory_remember' in tools || 'memory_recall' in tools || 'memory_record_episode' in tools) {
    throw new Error('memory tool names are reserved by Nucleus');
  }
  return memory ? { ...tools, ...createMemoryTools(memory, input.context) } : tools;
}

/**
 * 使用 Nucleus 内置的 ToolLoopAgent 完成一次推理。
 */
export async function runNucleusAgent<TOutput>(
  input: NucleusInput,
  options: NucleusOptions<TOutput>,
  memory?: Memory,
): Promise<TOutput> {
  const longTermMemories = input.memories.filter(entry => entry.kind === 'long-term');
  const episodicMemories = input.memories.filter(entry => entry.kind === 'episodic');
  const prompt = createContextPrompt({
    context: input.context,
    trigger: TRIGGER_NAMES[input.trigger],
    profile: options.prompt,
    systemSections: [
      ...(input.memoryInstructions
        ? [{ name: '记忆上下文', content: input.memoryInstructions }]
        : []),
      ...(memory
        ? [
            {
              name: '记忆规则',
              content:
                '每轮结束前必须调用 memory_record_episode 一次，总结这一轮实际发生的事情。稳定事实、偏好或经验另用 memory_remember 保存。',
            },
          ]
        : []),
    ],
    longTermMemories,
    episodicMemories,
  });
  const agent = new ToolLoopAgent({
    model: options.model,
    instructions: prompt.system.map(content => ({ role: 'system' as const, content })),
    tools: resolveTools(input, options, memory),
    output: options.output ?? Output.text(),
    ...(options.stopWhen ? { stopWhen: options.stopWhen } : {}),
  });
  const result = await agent.generate({ messages: await resolveMessages(input, options, prompt) });
  return result.output as TOutput;
}
