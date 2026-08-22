// @env node

import path from 'node:path';

import { AURIS_MODEL_PATHS, AURIS_SAMPLE_RATE } from './constants.ts';
import type { AurisModelConfig } from './types.ts';

export function createAurisModelConfig(): AurisModelConfig {
  return {
    recognizer: {
      featConfig: {
        sampleRate: AURIS_SAMPLE_RATE,
        featureDim: 80,
      },
      modelConfig: {
        qwen3Asr: {
          convFrontend: path.join(AURIS_MODEL_PATHS.asr, 'conv_frontend.onnx'),
          encoder: path.join(AURIS_MODEL_PATHS.asr, 'encoder.int8.onnx'),
          decoder: path.join(AURIS_MODEL_PATHS.asr, 'decoder.int8.onnx'),
          tokenizer: path.join(AURIS_MODEL_PATHS.asr, 'tokenizer'),
          hotwords: '',
          maxTotalLen: 512,
          maxNewTokens: 128,
          temperature: 0.000_001,
          topP: 0.8,
          seed: 42,
        },
        tokens: '',
        numThreads: 2,
        provider: 'cpu',
      },
    },
    vad: {
      tenVad: {
        model: AURIS_MODEL_PATHS.vad,
        threshold: 0.25,
        minSpeechDuration: 0.5,
        minSilenceDuration: 0.5,
        windowSize: 256,
        maxSpeechDuration: 10,
      },
      sampleRate: AURIS_SAMPLE_RATE,
      numThreads: 1,
      provider: 'cpu',
    },
    speaker: {
      model: AURIS_MODEL_PATHS.speaker,
      numThreads: 1,
      provider: 'cpu',
    },
  };
}
