// @env node

import type { FilePart, ModelMessage, TextPart } from 'ai';

import { resolveImagePart } from './image.ts';
import type { NucleusInput, NucleusMessage, NucleusPrompt } from './types.ts';

/**
 * 将 Nucleus Context 的多模态输入转换为首条消息，再追加应用提供的消息。
 */
export async function resolveNucleusMessages(
  input: NucleusInput,
  sources: readonly NucleusMessage[] | undefined,
  prompt: NucleusPrompt,
): Promise<ModelMessage[]> {
  const content: Array<TextPart | FilePart> = [];
  for (const part of prompt.input) {
    if (part.type === 'text') {
      content.push({ type: 'text', text: part.text });
    } else {
      content.push(await resolveImagePart(part.path));
    }
  }

  const messages: ModelMessage[] = [{ role: 'user', content }];
  for (const source of sources ?? []) {
    const value = await source(input);
    messages.push(...(Array.isArray(value) ? value : [value]));
  }
  return messages;
}
