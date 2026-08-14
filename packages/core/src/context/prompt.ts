import type { Context } from './context.ts';
import type { ContextPrompt, ContextPromptInput } from './types.ts';

const TRIGGER_NAMES = {
  manual: '手动触发',
  'speech-end': '语音结束',
  interval: '主动思考',
} as const;

/**
 * 统一组合 system 区块、本轮输入区块与当前 Percept。
 */
export function createContextPrompt(input: ContextPromptInput, context: Context): ContextPrompt {
  const lines = ['# 本轮输入', '', '[触发原因]', TRIGGER_NAMES[input.trigger]];
  for (const section of input.inputSections ?? []) {
    lines.push('', `# ${section.name}`, '', section.content);
  }
  const text = lines.join('\n');
  const percepts = context.messageBuilder(input.percepts);

  return {
    system: [context.systemBuilder(input.sections)],
    input: [
      {
        type: 'text',
        text,
      },
      ...percepts,
    ],
  };
}
