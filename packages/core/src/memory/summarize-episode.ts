import { generateText } from 'ai';
import type { FilePart, LanguageModel, TextPart } from 'ai';

import { definePrompt } from '#utils';

const EPISODE_SYSTEM_PROMPT = definePrompt(`
将这段经历总结为简洁、客观、过去时的纯文本。
只记录实际发生的事情，不推测。
`);

export interface EpisodeSummaryInput {
  /** 按时间排列的文字与图片经历证据。 */
  readonly content: readonly (TextPart | FilePart)[];
}

/** 将一批经历证据总结为可持久化的纯文本。 */
export type EpisodeSummarizer = (input: EpisodeSummaryInput) => Promise<string>;

/**
 * 使用指定模型执行一次无工具的经历总结。
 */
export async function summarizeEpisode(
  model: LanguageModel,
  input: EpisodeSummaryInput,
): Promise<string> {
  const result = await generateText({
    model,
    system: EPISODE_SYSTEM_PROMPT,
    messages: [{ role: 'user', content: [...input.content] }],
  });
  return result.text.trim();
}
