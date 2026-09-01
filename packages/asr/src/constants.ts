import path from 'node:path';

export const AURIS_SAMPLE_RATE = 16_000;
export const AURIS_VAD_WINDOW_SIZE = 256;
export const DEFAULT_BUFFER_SECONDS = 30;
export const DEFAULT_SPEAKER_THRESHOLD = 0.6;
export const DEFAULT_MAX_SPEAKERS = 8;

export const DATA_DIR = '.ciel' as const;

export function resolveDataPath(): string {
  return process.env.CIEL_DATA_DIR?.trim() || path.resolve(process.cwd(), DATA_DIR);
}

export function resolveAurisModelsPath(): string {
  return path.join(resolveDataPath(), 'models');
}

export function resolveAurisVoiceprintsPath(): string {
  return path.join(resolveDataPath(), 'voiceprints');
}

export function resolveAurisModelPaths() {
  const models = resolveAurisModelsPath();
  return {
    asr: path.join(models, 'asr', 'qwen3-asr-1.7b-int8'),
    vad: path.join(models, 'vad', 'ten-vad.int8.onnx'),
    speaker: path.join(models, 'speaker', 'model.onnx'),
  } as const;
}
