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
        transducer: {
          encoder: path.join(AURIS_MODEL_PATHS.asr, 'encoder-epoch-99-avg-1.onnx'),
          decoder: path.join(AURIS_MODEL_PATHS.asr, 'decoder-epoch-99-avg-1.onnx'),
          joiner: path.join(AURIS_MODEL_PATHS.asr, 'joiner-epoch-99-avg-1.onnx'),
        },
        tokens: path.join(AURIS_MODEL_PATHS.asr, 'tokens.txt'),
        numThreads: 2,
        provider: 'cpu',
      },
      enableEndpoint: true,
    },
    vad: {
      sileroVad: {
        model: AURIS_MODEL_PATHS.vad,
        threshold: 0.5,
        minSpeechDuration: 0.25,
        minSilenceDuration: 0.5,
        windowSize: 512,
        maxSpeechDuration: 30,
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
