// @env node

import { access } from 'node:fs/promises';
import path from 'node:path';

import {
  AURIS_SAMPLE_RATE,
  resolveAurisModelPaths,
  resolveAurisModelsPath,
  resolveDataPath,
} from './constants.ts';
import type { AurisModelConfig } from './types.ts';

const TOKENIZER_FILES = ['merges.txt', 'tokenizer_config.json', 'vocab.json'] as const;

export interface AurisConfigurationCheck {
  readonly dataPath: string;
  readonly modelsPath: string;
  readonly missingFiles: readonly string[];
  readonly valid: boolean;
}

export function createAurisModelConfig(): AurisModelConfig {
  const paths = resolveAurisModelPaths();
  return {
    recognizer: {
      featConfig: {
        sampleRate: AURIS_SAMPLE_RATE,
        featureDim: 80,
      },
      modelConfig: {
        qwen3Asr: {
          convFrontend: path.join(paths.asr, 'conv_frontend.onnx'),
          encoder: path.join(paths.asr, 'encoder.int8.onnx'),
          decoder: path.join(paths.asr, 'decoder.int8.onnx'),
          tokenizer: path.join(paths.asr, 'tokenizer'),
          hotwords: '',
          maxTotalLen: 512,
          maxNewTokens: 256,
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
        model: paths.vad,
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
      model: paths.speaker,
      numThreads: 1,
      provider: 'cpu',
    },
  };
}

export async function checkAurisConfiguration(): Promise<AurisConfigurationCheck> {
  const paths = resolveAurisModelPaths();
  const required = [
    path.join(paths.asr, 'conv_frontend.onnx'),
    path.join(paths.asr, 'encoder.int8.onnx'),
    path.join(paths.asr, 'decoder.int8.onnx'),
    ...TOKENIZER_FILES.map(file => path.join(paths.asr, 'tokenizer', file)),
    paths.vad,
    paths.speaker,
  ];
  const present = await Promise.all(required.map(file => exists(file)));
  const missingFiles = required.filter((_file, index) => !present[index]);
  return {
    dataPath: resolveDataPath(),
    modelsPath: resolveAurisModelsPath(),
    missingFiles,
    valid: missingFiles.length === 0,
  };
}

async function exists(file: string): Promise<boolean> {
  try {
    await access(file);
    return true;
  } catch {
    return false;
  }
}
