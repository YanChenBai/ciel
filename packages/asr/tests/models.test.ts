import { describe, expect, it } from 'vite-plus/test';

import { createAurisModelConfig } from '../src/models.ts';

describe('createAurisModelConfig', () => {
  it('使用 SenseVoiceSmall INT8 与 TEN-VAD', () => {
    const config = createAurisModelConfig();

    expect(config.recognizer.modelConfig?.senseVoice).toMatchObject({
      language: 'auto',
      useInverseTextNormalization: 1,
    });
    expect(config.recognizer.modelConfig?.senseVoice?.model).toMatch(/model\.int8\.onnx$/);
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
