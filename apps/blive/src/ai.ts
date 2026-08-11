import { createOpenAICompatible } from '@ai-sdk/openai-compatible';
import type { LanguageModel } from 'ai';

export interface BliveAIConfig {
  readonly apiKey: string;
  readonly baseURL: string;
  readonly model: string;
}

export function resolveBliveAIConfig(environment: NodeJS.ProcessEnv = process.env): BliveAIConfig {
  return {
    apiKey: requireValue(
      environment.BLIVE_AI_API_KEY ?? environment.OPENROUTER_API_KEY,
      'BLIVE_AI_API_KEY',
    ),
    baseURL: environment.BLIVE_AI_BASE_URL ?? 'https://openrouter.ai/api/v1',
    model: requireValue(
      environment.BLIVE_AI_VISION_MODEL ?? environment.BLIVE_AI_MODEL,
      'BLIVE_AI_VISION_MODEL',
    ),
  };
}

export function createBliveLanguageModel(
  config: BliveAIConfig = resolveBliveAIConfig(),
): LanguageModel {
  const provider = createOpenAICompatible({
    name: 'blive-ai',
    apiKey: config.apiKey,
    baseURL: config.baseURL,
  });
  return provider.chatModel(config.model);
}

function requireValue(value: string | undefined, name: string): string {
  const normalized = value?.trim();
  if (!normalized) throw new Error(`缺少 ${name}`);
  return normalized;
}
