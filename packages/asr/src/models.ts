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
        senseVoice: {
          model: path.join(AURIS_MODEL_PATHS.asr, 'model.int8.onnx'),
          language: 'auto',
          useInverseTextNormalization: 1,
        },
        tokens: path.join(AURIS_MODEL_PATHS.asr, 'tokens.txt'),
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
