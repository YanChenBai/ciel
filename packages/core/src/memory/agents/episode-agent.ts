import { generateText } from 'ai';
import type { FilePart, LanguageModel, TextPart } from 'ai';

import { definePrompt } from '#utils';

import type { MemoryAgent } from './types.ts';

const EPISODE_SYSTEM_PROMPT = definePrompt(`
将这段经历总结为简洁、客观、过去时的纯文本。
只记录实际发生的事情，不推测。
`);

export interface EpisodeAgentInput {
  readonly content: readonly (TextPart | FilePart)[];
}

/** 无工具、只读输入的经历总结子 Agent。持久化仍由调用方负责。 */
export class EpisodeAgent implements MemoryAgent<EpisodeAgentInput, string> {
  constructor(private readonly model: LanguageModel) {}

  async run(input: EpisodeAgentInput): Promise<string> {
    const result = await generateText({
      model: this.model,
      system: EPISODE_SYSTEM_PROMPT,
      messages: [{ role: 'user', content: [...input.content] }],
    });
    return result.text.trim();
  }
}
