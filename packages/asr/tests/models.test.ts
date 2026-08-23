import { describe, expect, it } from 'vite-plus/test';

import { createAurisModelConfig } from '../src/models.ts';

describe('createAurisModelConfig', () => {
  it('使用 Qwen3-ASR-1.7B INT8 与 TEN-VAD', () => {
    const config = createAurisModelConfig();

    expect(config.recognizer.modelConfig?.qwen3Asr).toMatchObject({
      hotwords: '',
      maxNewTokens: 256,
      maxTotalLen: 512,
    });
    expect(config.recognizer.modelConfig?.qwen3Asr?.convFrontend).toMatch(/conv_frontend\.onnx$/);
    expect(config.recognizer.modelConfig?.qwen3Asr?.encoder).toMatch(/encoder\.int8\.onnx$/);
    expect(config.recognizer.modelConfig?.qwen3Asr?.decoder).toMatch(/decoder\.int8\.onnx$/);
    expect(config.recognizer.modelConfig?.qwen3Asr?.tokenizer).toMatch(/tokenizer$/);
    expect(config.vad.sileroVad).toBeUndefined();
    expect(config.vad.tenVad).toMatchObject({
      threshold: 0.25,
      minSilenceDuration: 0.5,
      minSpeechDuration: 0.5,
      windowSize: 256,
      maxSpeechDuration: 10,
    });
    expect(config.vad.tenVad?.model).toMatch(/ten-vad\.int8\.onnx$/);
  });
});
