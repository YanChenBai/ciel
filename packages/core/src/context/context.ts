import type { Percept } from '#src/percepts/index.ts';
import type { SignalConstructor } from '#src/signals/index.ts';
import type { Stimulus, StimulusConstructor } from '#src/stimulus/index.ts';

import type { ContextDefinition, ContextPromptPart, ContextTime } from './types.ts';

function joinLine(...lines: string[]): string {
  return lines.join('\n');
}

function getPerceptTime(percept: Percept): ContextTime {
  return percept.type === 'reading'
    ? { startAt: percept.timestamp, endAt: percept.timestamp }
    : { startAt: percept.startAt, endAt: percept.endAt };
}

function formatTime(time: ContextTime): string {
  const startAt = time.startAt.toISOString();
  const endAt = time.endAt.toISOString();
  return startAt === endAt ? startAt : `${startAt} - ${endAt}`;
}

function uniqueDefinitions(definitions: readonly ContextDefinition[]): ContextDefinition[] {
  const seen = new Set<string>();
  return definitions.filter(definition => {
    const key = `${definition.kind}\u0000${definition.name}\u0000${definition.description}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/**
 * 将场景语义与实时感知构建为模型可使用的上下文。
 */
export class Context {
  constructor(
    private readonly signals: readonly SignalConstructor[],
    private readonly stimuli: readonly Stimulus[],
  ) {}

  /**
   * 当前所有可信的上下文定义。
   */
  get definitions(): readonly ContextDefinition[] {
    const scenes = this.stimuli.map(stimulus => {
      const Stimulus = stimulus.constructor as StimulusConstructor;
      Stimulus.assertMeta();
      return {
        kind: 'scene' as const,
        name: Stimulus.meta.name,
        description: Stimulus.meta.description,
      };
    });

    const signals = this.signals.map(Signal => {
      Signal.assertMeta();
      return {
        kind: 'signal' as const,
        name: Signal.meta.name,
        description: Signal.meta.description,
      };
    });

    return uniqueDefinitions([...scenes, ...signals]);
  }

  /**
   * 构建由 Stimulus 与 Signal 定义组成的 system 内容。
   */
  systemBuilder(): string {
    return joinLine(
      '# 基础定义',
      '',
      ...this.definitions.flatMap(definition => [
        `## ${definition.name}`,
        definition.description,
        '',
      ]),
    ).trimEnd();
  }

  /**
   * 将实时 Percept 构建为按时间排列的多模态消息内容。
   */
  messageBuilder(percepts: readonly Percept[]): ContextPromptPart[] {
    const sorted = percepts.toSorted((left, right) => {
      const leftTime = getPerceptTime(left);
      const rightTime = getPerceptTime(right);
      return (
        leftTime.startAt.getTime() - rightTime.startAt.getTime() ||
        leftTime.endAt.getTime() - rightTime.endAt.getTime()
      );
    });
    if (sorted.length === 0) return [];

    const parts: ContextPromptPart[] = [];
    let text = '# 基础数据';
    sorted.forEach(percept => {
      const Signal = percept.originSignal;
      Signal.assertMeta();
      const header = `[${Signal.meta.name}]\n[${formatTime(getPerceptTime(percept))}]`;
      const nextText = text ? `${text}\n\n${header}` : header;
      if (percept.type === 'sight') {
        parts.push({ type: 'text', text: nextText });
        parts.push({ type: 'image', path: percept.path });
        text = '';
        return;
      }

      const speaker = percept.type === 'hearing' && percept.speaker ? `[${percept.speaker}] ` : '';
      text = `${nextText} ${speaker}${percept.content}`;
    });
    if (text) parts.push({ type: 'text', text });
    return parts;
  }
}
