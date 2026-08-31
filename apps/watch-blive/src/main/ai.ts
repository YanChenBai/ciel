// @env node

import { createOpenAICompatible } from '@ai-sdk/openai-compatible';
import type { StreamFn } from '@earendil-works/pi-agent-core';
import type { Model } from '@earendil-works/pi-ai';
import { streamSimple } from '@earendil-works/pi-ai/compat';
import type { EmbeddingModel } from 'ai';

export interface WatchBliveAI {
  readonly embedder: Exclude<EmbeddingModel, string>;
  readonly model: Model<'openai-completions'>;
  readonly stream: StreamFn;
}

export function createWatchBliveAI(environment: NodeJS.ProcessEnv = process.env): WatchBliveAI {
  const apiKey = required(environment.AI_API_KEY, 'AI_API_KEY');
  const modelId = required(environment.AI_MODEL, 'AI_MODEL');
  const baseUrl = environment.AI_BASE_URL?.trim() || 'https://openrouter.ai/api/v1';
  const provider = createOpenAICompatible({ name: 'watch-blive', apiKey, baseURL: baseUrl });
  return {
    embedder: provider.embeddingModel(modelId),
    model: {
      api: 'openai-completions',
      baseUrl,
      contextWindow: 128_000,
      cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
      id: modelId,
      input: ['text', 'image'],
      maxTokens: 8_192,
      name: modelId,
      provider: 'watch-blive',
      reasoning: false,
    },
    stream: (model, context, options) => streamSimple(model, context, { ...options, apiKey }),
  };
}

function required(value: string | undefined, name: string): string {
  const normalized = value?.trim();
  if (!normalized) throw new Error(`缺少 ${name}`);
  return normalized;
}
