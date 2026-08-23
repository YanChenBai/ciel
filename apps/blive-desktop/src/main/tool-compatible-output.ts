import { Output } from 'ai';
import type { ZodType } from 'zod';

/**
 * Keeps local schema validation without sending response_format to the model.
 * Some OpenAI-compatible providers prioritize response_format over a forced tool choice.
 */
export function createToolCompatibleObjectOutput<T>(schema: ZodType<T>): Output.Output<T> {
  const output = Output.object({ schema });
  return {
    ...output,
    parseCompleteOutput: (options, context) =>
      output.parseCompleteOutput({ text: normalizeJsonObject(options.text) }, context),
    responseFormat: Promise.resolve({ type: 'text' }),
  };
}

function normalizeJsonObject(text: string): string {
  const normalized = text.trim();
  const start = normalized.indexOf('{');
  if (start < 0) return escapeJsonStringControlCharacters(normalized);

  let depth = 0;
  let escaped = false;
  let quoted = false;
  for (let index = start; index < normalized.length; index += 1) {
    const character = normalized[index];
    if (quoted) {
      if (escaped) escaped = false;
      else if (character === '\\') escaped = true;
      else if (character === '"') quoted = false;
      continue;
    }
    if (character === '"') quoted = true;
    else if (character === '{') depth += 1;
    else if (character === '}' && --depth === 0) {
      return escapeJsonStringControlCharacters(normalized.slice(start, index + 1));
    }
  }
  return escapeJsonStringControlCharacters(normalized);
}

function escapeJsonStringControlCharacters(text: string): string {
  let escaped = false;
  let quoted = false;
  let result = '';

  for (const character of text) {
    if (quoted && character <= '\u001f') {
      result += escapeJsonControlCharacter(character);
      continue;
    }

    result += character;
    if (!quoted) {
      if (character === '"') quoted = true;
      continue;
    }
    if (escaped) escaped = false;
    else if (character === '\\') escaped = true;
    else if (character === '"') quoted = false;
  }

  return result;
}

function escapeJsonControlCharacter(character: string): string {
  if (character === '\b') return '\\b';
  if (character === '\t') return '\\t';
  if (character === '\n') return '\\n';
  if (character === '\f') return '\\f';
  if (character === '\r') return '\\r';
  return `\\u${character.charCodeAt(0).toString(16).padStart(4, '0')}`;
}
