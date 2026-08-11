import type {
  ContextData,
  ContextDefinition,
  ContextTime,
  NucleusInput,
  NucleusPrompt,
  NucleusPromptPart,
} from './types.ts';

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

function formatDefinitions(definitions: readonly ContextDefinition[]): string {
  return [
    '# 基础定义',
    ...definitions.map(definition => `## ${definition.name}\n${definition.description}`),
  ].join('\n\n');
}

function appendData(parts: NucleusPromptPart[], data: ContextData, text: string): string {
  const header = `[${data.scene.name} / ${data.signal.name}]\n[${formatTime(data.time)}]`;
  if (data.content.type === 'text') {
    const speaker = data.content.speaker ? `[${data.content.speaker}] ` : '';
    return `${text}\n\n${header} ${speaker}${data.content.text}`;
  }
  parts.push({ type: 'text', text: `${text}\n\n${header}` });
  parts.push({ type: 'image', path: data.content.path });
  return '';
}

function formatRealtimeData(data: readonly ContextData[]): NucleusPromptPart[] {
  if (data.length === 0) return [];
  const parts: NucleusPromptPart[] = [];
  let text = '# 实时感知';
  data.forEach(entry => {
    text = appendData(parts, entry, text);
  });
  if (text) parts.push({ type: 'text', text });
  return parts;
}

function formatLongTermMemories(input: NucleusInput): string | undefined {
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

function formatEpisodicMemories(input: NucleusInput): NucleusPromptPart[] {
  const memories = input.memories.filter(memory => memory.kind === 'episodic');
  const parts: NucleusPromptPart[] = [];
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

export function createNucleusPrompt(input: NucleusInput): NucleusPrompt {
  const system = [
    ...(input.memoryInstructions ? [`# 记忆上下文\n\n${input.memoryInstructions}`] : []),
    `# 记忆规则\n\n${MEMORY_RULES}`,
    formatDefinitions(input.definitions),
  ];
  const longTermMemories = formatLongTermMemories(input);
  if (longTermMemories) system.push(longTermMemories);
  return {
    system,
    input: [...formatEpisodicMemories(input), ...formatRealtimeData(input.data)],
  };
}
