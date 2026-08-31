// @env node

import { defineProjector, type LLMContext, type Percept, type ProjectorExtension } from 'corex';

import { Hearing, Sight } from './definitions.ts';
import type { SensuProjectorOptions } from './types.ts';
import { composeVisionFrames } from './vision/composer.ts';

const DEFAULT_HEARING_PROMPT = '以下是按时间排列的听觉转写，请结合来源与说话人理解。';
const DEFAULT_VISION_PROMPT = '以下画面按来源合并，编号顺序与采集时间一致。';

interface VisionGroup {
  readonly name: string;
  readonly frames: Array<{ readonly data: Buffer; readonly recordedAt: number }>;
}

function selectFrames<T>(frames: readonly T[], limit: number): readonly T[] {
  if (frames.length <= limit) return frames;
  if (limit === 1) return [frames.at(-1)!];
  return Array.from(
    { length: limit },
    (_, index) => frames[Math.round((index * (frames.length - 1)) / (limit - 1))]!,
  );
}

function temporalStart(percept: Percept): number {
  return percept.temporal.kind === 'instant' ? percept.temporal.at : percept.temporal.start;
}

function textContent(percept: Percept): string | undefined {
  return percept.contents.find(content => content.type === 'text')?.text;
}

function imageData(percept: Percept): Buffer | undefined {
  const image = percept.contents.find(content => content.type === 'image');
  if (!image || typeof image.data === 'string' || image.data instanceof URL) return undefined;
  return Buffer.from(image.data);
}

export function createSensuProjector(
  name: string,
  options: SensuProjectorOptions = {},
): ProjectorExtension {
  const maxVisionFrames = options.maxVisionFrames ?? 9;
  if (!Number.isSafeInteger(maxVisionFrames) || maxVisionFrames < 1 || maxVisionFrames > 9) {
    throw new Error('projector.maxVisionFrames must be an integer between 1 and 9');
  }

  return defineProjector({
    name,
    description: '合并视觉变化帧与听觉转写。',
    async project({ engram }): Promise<LLMContext> {
      const context: LLMContext[number][] = [];
      const hearing = engram.entries(Hearing);
      if (hearing.length > 0) {
        const lines = hearing.flatMap(entry => {
          const text = textContent(entry.value);
          if (!text) return [];
          return [
            `[${new Date(temporalStart(entry.value)).toISOString()}] ` +
              `[${entry.value.origin.name}] ${text}`,
          ];
        });
        if (lines.length > 0) {
          const prompt = options.hearingPrompt ?? DEFAULT_HEARING_PROMPT;
          context.push({
            type: 'text',
            text: ['# Hearing', prompt, lines.join('\n')].filter(Boolean).join('\n\n'),
          });
        }
      }

      const groups = new Map<string, VisionGroup>();
      for (const entry of engram.entries(Sight)) {
        const data = imageData(entry.value);
        if (!data) continue;
        const key = entry.value.origin.id;
        const group = groups.get(key) ?? { name: entry.value.origin.name, frames: [] };
        group.frames.push({ data, recordedAt: entry.recordedAt });
        groups.set(key, group);
      }

      for (const group of groups.values()) {
        const selected = selectFrames(
          group.frames.toSorted((left, right) => left.recordedAt - right.recordedAt),
          maxVisionFrames,
        );
        const image = await composeVisionFrames(selected.map(frame => frame.data));
        const prompt = options.visionPrompt ?? DEFAULT_VISION_PROMPT;
        context.push(
          {
            type: 'text',
            text: ['# Sight', prompt, `来源：${group.name}`].filter(Boolean).join('\n\n'),
          },
          { type: 'image', data: image, mimeType: 'image/jpeg' },
        );
      }

      return context;
    },
  });
}
