import { describe, expect, it } from 'vite-plus/test';

import { createBliveAI, resolveBliveAIConfig } from '../src/ai.ts';

describe('resolveBliveAIConfig', () => {
  it('读取显式模型配置并提供 OpenRouter 默认地址', () => {
    expect(
      resolveBliveAIConfig({
        BLIVE_AI_API_KEY: ' key ',
        BLIVE_AI_VISION_MODEL: ' provider/vision-model ',
      }),
    ).toEqual({
      apiKey: 'key',
      baseURL: 'https://openrouter.ai/api/v1',
      model: 'provider/vision-model',
    });
  });

  it('兼容旧的 BLIVE_AI_MODEL 配置', () => {
    expect(
      resolveBliveAIConfig({
        BLIVE_AI_API_KEY: 'key',
        BLIVE_AI_MODEL: 'provider/vision-model',
      }).model,
    ).toBe('provider/vision-model');
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
    ).toThrow('BLIVE_AI_VISION_MODEL');
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
