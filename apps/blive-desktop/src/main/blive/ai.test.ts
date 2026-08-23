import { describe, expect, it } from 'vite-plus/test';

import { createBliveAI, resolveBliveAIConfig } from './ai.ts';

describe('resolveBliveAIConfig', () => {
  it('读取显式模型配置并提供 OpenRouter 默认地址', () => {
    expect(
      resolveBliveAIConfig({
        BLIVE_AI_API_KEY: ' key ',
        BLIVE_AI_MODEL: ' provider/shared-model ',
      }),
    ).toEqual({
      apiKey: 'key',
      baseURL: 'https://openrouter.ai/api/v1',
      model: 'provider/shared-model',
    });
  });

  it('缺少密钥或模型时快速失败', () => {
    expect(() =>
      resolveBliveAIConfig({
        BLIVE_AI_MODEL: 'provider/model',
      }),
    ).toThrow('BLIVE_AI_API_KEY');
    expect(() =>
      resolveBliveAIConfig({
        BLIVE_AI_API_KEY: 'key',
      }),
    ).toThrow('BLIVE_AI_MODEL');
  });

  it('从同一个模型 ID 创建生成和 embedding handle', () => {
    const ai = createBliveAI({
      apiKey: 'key',
      baseURL: 'https://example.com/v1',
      model: 'provider/shared-model',
    });

    expect(ai.model).toBeDefined();
    expect(ai.embedder.modelId).toBe('provider/shared-model');
  });
});
