import type { Context } from './context.ts';
import type { ContextPrompt, ContextPromptInput, ContextPromptPart, ContextTime } from './types.ts';

const TRIGGER_NAMES = {
  manual: '手动触发',
  percept: '感知更新',
  interval: '主动思考',
} as const;

const MEMORY_RULES = '发现稳定事实、偏好或经验时使用 memory_remember 保存；不要保存短暂观察。';

function formatTime(time: ContextTime): string {
  const startAt = time.startAt.toISOString();
  const endAt = time.endAt.toISOString();
  return startAt === endAt ? startAt : `${startAt} - ${endAt}`;
}

function formatLongTermMemories(input: ContextPromptInput): string | undefined {
  const memories = input.memories.filter(memory => memory.kind === 'long-term');
  if (memories.length === 0) return undefined;
  return [
    '# 长期记忆',
    ...memories.map(
      memory =>
        `## ${memory.name}\n${memory.description}\n\n${memory.content.type === 'text' ? memory.content.text : memory.content.path}`,
    ),
  ].join('\n\n');
}

function formatEpisodicMemories(input: ContextPromptInput): ContextPromptPart[] {
  const memories = input.memories.filter(memory => memory.kind === 'episodic');
  const parts: ContextPromptPart[] = [];
  let text = `# 本轮输入\n\n[触发原因]\n${TRIGGER_NAMES[input.trigger]}`;
  if (memories.length > 0) {
    text += '\n\n# 情景记忆';
    memories.forEach(memory => {
      const header = `[${memory.name}]\n[${formatTime(memory.time)}]`;
      if (memory.content.type === 'text') {
        const speaker = memory.content.speaker ? `[${memory.content.speaker}] ` : '';
        text += `\n\n${header} ${speaker}${memory.content.text}`;
      } else {
        parts.push({ type: 'text', text: `${text}\n\n${header}` });
        parts.push({ type: 'image', path: memory.content.path });
        text = '';
      }
    });
  }
  if (text) parts.push({ type: 'text', text });
  return parts;
}

/**
 * 统一组合基础定义、记忆与当前 Percept。
 */
export function createContextPrompt(input: ContextPromptInput, context: Context): ContextPrompt {
  const system = [
    ...(input.memoryInstructions ? [`# 记忆上下文\n\n${input.memoryInstructions}`] : []),
    `# 记忆规则\n\n${MEMORY_RULES}`,
    context.systemBuilder(),
  ];
  const longTermMemories = formatLongTermMemories(input);
  if (longTermMemories) system.push(longTermMemories);
  return {
    system,
    input: [...formatEpisodicMemories(input), ...context.messageBuilder(input.percepts)],
  };
}
