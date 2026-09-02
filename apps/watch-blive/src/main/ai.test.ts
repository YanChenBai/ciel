import { describe, expect, it } from 'vite-plus/test';

import { createWatchBliveAI } from './ai.ts';

describe('createWatchBliveAI', () => {
  it('未配置 embedding 模型时只创建生成模型', () => {
    const ai = createWatchBliveAI({
      AI_API_KEY: 'key',
      AI_MODEL: 'mimo-v2.5',
      AI_BASE_URL: 'https://api.example.com/v1',
    });

    expect(ai.model.id).toBe('mimo-v2.5');
    expect(ai.embedder).toBeUndefined();
  });

  it('显式配置时创建独立 embedding 模型', () => {
    const ai = createWatchBliveAI({
      AI_API_KEY: 'chat-key',
      AI_MODEL: 'chat-model',
      AI_BASE_URL: 'https://chat.example.com/v1',
      AI_EMBEDDING_API_KEY: 'embedding-key',
      AI_EMBEDDING_BASE_URL: 'https://embedding.example.com/v1',
      AI_EMBEDDING_MODEL: 'embedding-model',
    });

    expect(ai.embedder).toMatchObject({ modelId: 'embedding-model' });
  });
});
