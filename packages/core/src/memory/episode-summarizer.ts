// @env node

import { readFile } from 'node:fs/promises';

import { generateText } from 'ai';
import type { FilePart, LanguageModel, TextPart } from 'ai';

import type { PerceptRecord } from '#src/percepts/index.ts';

import type { EpisodeRecordResult } from './types.ts';

const EPISODE_SUMMARY_PROMPT =
  '将这段经历总结为简洁、客观、过去时的纯文本。只记录实际发生的事情，不推测。';

/** 将感知证据转换为独立 Episode，持久化与资源隔离仍由 Memory 负责。 */
export class EpisodeSummarizer {
  constructor(private readonly model: LanguageModel) {}

  async summarize(data: readonly PerceptRecord[]): Promise<EpisodeRecordResult | void> {
    if (data.length === 0) return;

    const content = await createEpisodeContent(data);
    const result = await generateText({
      model: this.model,
      system: EPISODE_SUMMARY_PROMPT,
      messages: [{ role: 'user', content }],
    });
    const summary = result.text.trim();
    if (!summary) throw new Error('Episode summarizer returned an empty summary');

    const createdAt = new Date(Math.max(...data.map(entry => entry.time.endAt.getTime())));
    return { createdAt, summary };
  }
}

async function createEpisodeContent(
  data: readonly PerceptRecord[],
): Promise<Array<TextPart | FilePart>> {
  const content: Array<TextPart | FilePart> = [];
  for (const entry of data) {
    const header = `[${entry.stimulusDefinition.name} / ${entry.signal.name}]\n[${formatRange(entry.time)}]`;
    if (entry.content.type === 'image') {
      content.push({ type: 'text', text: header });
      content.push(await resolveImagePart(entry.content.path));
      continue;
    }
    const speaker = entry.content.speaker ? `[${entry.content.speaker}] ` : '';
    content.push({ type: 'text', text: `${header} ${speaker}${entry.content.text}` });
  }
  return content;
}

function formatRange(time: PerceptRecord['time']): string {
  const startAt = time.startAt.toISOString();
  const endAt = time.endAt.toISOString();
  if (startAt === endAt) return startAt;
  return `${startAt} - ${endAt}`;
}

async function resolveImagePart(imagePath: string): Promise<FilePart> {
  return {
    type: 'file',
    mediaType: 'image/jpeg',
    data: {
      type: 'data',
      data: (await readFile(imagePath)).toString('base64'),
    },
  };
}
