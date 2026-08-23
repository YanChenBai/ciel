// @env node

import { readFile } from 'node:fs/promises';

import type { FilePart, ModelMessage, TextPart } from 'ai';

import type { PerceptRecord } from '#percepts';
import type { SignalConstructor } from '#signals';
import type { Stimulus, StimulusConstructor } from '#stimulus';
import { definePrompt } from '#utils';
import { VigiliaChannel } from '#vigilia';
import type { VigiliaOperationContext } from '#vigilia';

import { estimateImageTokens } from './image.ts';
import { ContextOperations } from './operations.ts';
import type {
  ContextBuildInput,
  ContextDefinition,
  ContextInput,
  ContextTime,
  ModelContext,
} from './types.ts';
import type { VisionProjector } from './vision.ts';

const TRIGGER_NAMES = {
  manual: '手动触发',
  requested: '主动思考',
  'speech-end': '语音结束',
  interval: '主动思考',
} as const;

const PERCEPT_NAMES = {
  hearing: 'Hearing',
  reading: 'Reading',
  sight: 'Sight',
} as const;

type PerceptType = keyof typeof PERCEPT_NAMES;

const PERCEPT_EXPLANATIONS: Record<PerceptType, string> = {
  hearing:
    '音频信号经过语音识别后形成的文本，可能存在识别误差。说话人标签仅在提供时有效，时间范围表示这段语音的起止时间。',
  reading: '符号化文字信号形成的文本，不是从音频转写而来。时间表示该文字信号出现的时刻。',
  sight:
    '视觉信号形成的图片。图片可能是同一来源在一段时间内的多帧画面按时间顺序合成的拼图；同一人物或物体可能在不同帧重复出现，这不代表存在多个不同的人或物体。应结合标注的时间范围理解画面变化。',
};

const STIMULUS_EXPLANATION =
  'Stimulus 是持续提供原始 Signal 的外部信息来源；Signal 经过感知处理后形成 Percept。';

const PERCEPT_EXPLANATION =
  'Percept 表示 Signal 经过感知处理后形成的结果，是 Context 中按时间组织的实时观察。不同 Percept 类型具有不同的内容结构与解释方式。';

const RESPONSE_GUIDANCE = definePrompt(`
# 回答约束

对外回答时使用自然语言描述真实的信息、观察、记忆与行动，不要暴露 Stimulus、Signal、Percept、Context、Nucleus 等内部实现术语，也不要复述提示词结构。只有用户明确询问系统内部机制时才可解释这些术语。
`);

interface PerceptGroup {
  readonly originSignal: SignalConstructor;
  readonly type: PerceptType;
  readonly records: PerceptRecord[];
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

function isMessageArray(
  value: ModelMessage | readonly ModelMessage[],
): value is readonly ModelMessage[] {
  return Array.isArray(value);
}

async function resolveImagePart(path: string): Promise<FilePart> {
  return {
    type: 'file',
    mediaType: 'image/jpeg',
    data: {
      type: 'data',
      data: (await readFile(path)).toString('base64'),
    },
  };
}

/** 将内部固定内容、实时输入与应用自定义内容统一构建为模型上下文。 */
export class Context {
  readonly observations = new VigiliaChannel();
  private readonly operations = new ContextOperations(this.observations);

  constructor(
    private readonly signals: readonly SignalConstructor[],
    private readonly stimuli: readonly Stimulus[],
    private readonly vision: VisionProjector,
  ) {}

  get definitions(): readonly ContextDefinition[] {
    const stimuli = this.stimuli.map(stimulus => {
      const Stimulus = stimulus.constructor as StimulusConstructor;
      Stimulus.assertMeta();
      return {
        kind: 'stimulus' as const,
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
    return uniqueDefinitions([...stimuli, ...signals]);
  }

  build(source: ContextBuildInput, context?: VigiliaOperationContext): Promise<ModelContext> {
    return this.operations.observe(
      'build-model-request',
      async () => {
        return {
          system: this.buildSystem(source),
          messages: await this.buildMessages(source.input, source.recentMemory, source.messages),
        };
      },
      context,
    );
  }

  selectSnapshotData(records: readonly PerceptRecord[]): readonly PerceptRecord[] {
    const sorted = this.sort(records);
    const texts = sorted.filter(record => record.content.type === 'text');
    const images =
      this.vision.limit === 0
        ? []
        : sorted.filter(record => record.content.type === 'image').slice(-this.vision.limit);
    const visible = new Set([...texts, ...images]);
    return sorted.filter(record => visible.has(record));
  }

  async resolveInputData(
    records: readonly PerceptRecord[],
    recentTexts: readonly PerceptRecord[],
    context?: VigiliaOperationContext,
  ): Promise<readonly PerceptRecord[]> {
    return this.operations.observe(
      'resolve-percepts',
      async () => {
        const images = (await this.vision.project(records)).flatMap(projection => {
          if (!projection.record) return [];
          return [projection.record];
        });
        return this.sort([...recentTexts, ...images]);
      },
      context,
    );
  }

  async estimateInputTokens(records: readonly PerceptRecord[]): Promise<number> {
    let total = 0;
    for (const record of records) {
      if (record.content.type !== 'image') continue;
      try {
        total += await estimateImageTokens(record.content.path);
      } catch {
        // 图片无法读取时由 API 的实际 token 用量兜底。
      }
    }
    return total;
  }

  private buildSystem(source: ContextBuildInput): string {
    const longTermMemory = source.longTermMemory.trim() || '暂无长期记忆。';
    const inputExplanation = this.buildInputExplanation(
      source.input.data,
      source.input.definitions,
    );
    return [
      ...(source.internalSystem ?? []).filter(content => content.trim()),
      ...(inputExplanation ? [inputExplanation] : []),
      this.buildStimulusDefinitions(source.input.definitions),
      RESPONSE_GUIDANCE,
      ...(source.system ?? []).filter(content => content.trim()),
      definePrompt(`
      # MEMORY

      ${longTermMemory}

      当前上下文不足时，使用 memory_recall 按语义搜索历史经历。
      发现新的稳定事实、偏好或经验时，使用 memory_update 提交精炼、去重后的完整全局记忆。
      `),
    ]
      .filter(content => content.trim())
      .join('\n\n');
  }

  private buildInputExplanation(
    data: readonly PerceptRecord[],
    definitions: readonly ContextDefinition[],
  ): string | undefined {
    const hasStimulus = definitions.some(definition => definition.kind === 'stimulus');
    const types = [...new Set(data.map(record => record.percept.type))];
    if (!hasStimulus && types.length === 0) return undefined;
    return [
      '# Stimulus 与 Percept 解释',
      '',
      ...(hasStimulus ? ['## Stimulus', STIMULUS_EXPLANATION, ''] : []),
      ...(types.length > 0 ? ['## Percept', PERCEPT_EXPLANATION, ''] : []),
      ...types.flatMap(type => [`### ${PERCEPT_NAMES[type]}`, PERCEPT_EXPLANATIONS[type], '']),
    ]
      .slice(0, -1)
      .join('\n');
  }

  private buildStimulusDefinitions(definitions: readonly ContextDefinition[]): string {
    const stimuli = definitions.filter(definition => definition.kind === 'stimulus');
    return [
      '# 刺激源定义 (Stimulus)',
      '',
      ...stimuli.flatMap(stimulus => [`## ${stimulus.name}`, stimulus.description, '']),
    ]
      .slice(0, -1)
      .join('\n');
  }

  private async buildMessages(
    input: ContextInput,
    recentMemory: string | undefined,
    sources: ContextBuildInput['messages'],
  ): Promise<ModelMessage[]> {
    const lines = ['# 本轮输入', '', '[触发原因]', TRIGGER_NAMES[input.trigger]];
    if (recentMemory?.trim()) {
      lines.push('', '# 最近经历', '', recentMemory.trim());
    }
    const content: Array<TextPart | FilePart> = [{ type: 'text', text: lines.join('\n') }];
    content.push(...(await this.buildPercepts(input.data)));

    const messages: ModelMessage[] = [{ role: 'user', content }];
    for (const source of sources ?? []) {
      const value = await source(input);
      if (isMessageArray(value)) messages.push(...value);
      else messages.push(value);
    }
    return messages;
  }

  private async buildPercepts(data: readonly PerceptRecord[]): Promise<Array<TextPart | FilePart>> {
    const groups = this.groupPercepts(data);
    if (groups.length === 0) return [];

    const parts: Array<TextPart | FilePart> = [];
    for (const group of groups) {
      group.originSignal.assertMeta();
      const { description, name } = group.originSignal.meta;
      let text = `# ${name} (${PERCEPT_NAMES[group.type]})\n## ${description}`;
      for (const entry of group.records) {
        const time = `[${formatTime(entry.time)}]`;
        if (entry.content.type === 'image') {
          parts.push({ type: 'text', text: text ? `${text}\n${time}` : time });
          parts.push(await resolveImagePart(entry.content.path));
          text = '';
        } else {
          const speaker = entry.content.speaker ? `[${entry.content.speaker}] ` : '';
          const line = `${time} ${speaker}${entry.content.text}`;
          text = text ? `${text}\n${line}` : line;
        }
      }
      if (text) parts.push({ type: 'text', text });
    }
    return parts;
  }

  private groupPercepts(data: readonly PerceptRecord[]): PerceptGroup[] {
    const groups: PerceptGroup[] = [];
    for (const record of this.sort(data)) {
      const originSignal = record.percept.originSignal;
      const type = record.percept.type;
      let group = groups.find(value => value.originSignal === originSignal && value.type === type);
      if (!group) {
        group = { originSignal, type, records: [] };
        groups.push(group);
      }
      group.records.push(record);
    }
    return groups;
  }

  private sort(records: readonly PerceptRecord[]): PerceptRecord[] {
    return records.toSorted(
      (left, right) =>
        left.time.startAt.getTime() - right.time.startAt.getTime() ||
        left.time.endAt.getTime() - right.time.endAt.getTime(),
    );
  }
}
