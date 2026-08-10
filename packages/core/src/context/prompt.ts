import type {
  ContextDefinition,
  ContextPrompt,
  ContextPromptEntry,
  ContextPromptInput,
  ContextPromptPart,
  ContextPromptProfile,
  ContextPromptSection,
  ContextTime,
} from './types.ts';

function formatTime(time: ContextTime): string {
  const startAt = time.startAt.toISOString();
  const endAt = time.endAt.toISOString();
  return startAt === endAt ? startAt : `${startAt} - ${endAt}`;
}

function formatSection(section: ContextPromptSection): string {
  return `# ${section.name}\n\n${section.content}`;
}

function formatDefinitions(definitions: readonly ContextDefinition[]): string {
  return [
    '# 基础定义',
    ...definitions.map(definition => `## ${definition.name}\n${definition.description}`),
  ].join('\n\n');
}

function profileSections(profile?: ContextPromptProfile): ContextPromptSection[] {
  if (!profile) {
    return [];
  }
  return [
    ...(profile.identity ? [{ name: '身份', content: profile.identity }] : []),
    ...(profile.personality ? [{ name: '人格', content: profile.personality }] : []),
    ...(profile.rules?.length
      ? [{ name: '行为规则', content: profile.rules.map(rule => `- ${rule}`).join('\n') }]
      : []),
    ...(profile.sections ?? []),
  ];
}

function appendEntry(parts: ContextPromptPart[], entry: ContextPromptEntry, text: string): string {
  const header = `[${entry.name}]\n[${formatTime(entry.time)}]`;
  if (entry.content.type === 'text') {
    const speaker = entry.content.speaker ? `[${entry.content.speaker}] ` : '';
    return `${text}\n\n${header} ${speaker}${entry.content.text}`;
  }
  parts.push({ type: 'text', text: `${text}\n\n${header}` });
  parts.push({ type: 'image', path: entry.content.path });
  return '';
}

function appendEntries(
  parts: ContextPromptPart[],
  text: string,
  title: string,
  entries: readonly ContextPromptEntry[],
): string {
  if (entries.length === 0) {
    return text;
  }
  let next = `${text}\n\n# ${title}`;
  entries.forEach(entry => {
    next = appendEntry(parts, entry, next);
  });
  return next;
}

/**
 * 统一组合身份、人格、规则、语义定义、记忆与实时感知。
 * 稳定内容进入 system，过去情景与实时 Percept 进入本轮 user message。
 */
export function createContextPrompt(input: ContextPromptInput): ContextPrompt {
  const system = [
    ...profileSections(input.profile).map(formatSection),
    ...(input.systemSections ?? []).map(formatSection),
    formatDefinitions(input.context.definitions),
  ];

  const longTerm = input.longTermMemories ?? [];
  if (longTerm.length > 0) {
    system.push(
      formatSection({
        name: '长期记忆',
        content: longTerm
          .map(
            entry =>
              `## ${entry.name}\n${entry.description ?? ''}\n\n${entry.content.type === 'text' ? entry.content.text : entry.content.path}`,
          )
          .join('\n\n'),
      }),
    );
  }

  const parts: ContextPromptPart[] = [];
  let text = `# 本轮输入\n\n[触发原因]\n${input.trigger}`;
  text = appendEntries(parts, text, '情景记忆', input.episodicMemories ?? []);
  text = appendEntries(
    parts,
    text,
    '基础数据',
    input.context.data.map(data => ({ ...data, name: data.signal.name })),
  );
  parts.push({ type: 'text', text });
  return { system, input: parts };
}
