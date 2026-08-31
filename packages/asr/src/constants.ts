import path from 'node:path';

export const AURIS_SAMPLE_RATE = 16_000;
export const AURIS_VAD_WINDOW_SIZE = 256;
export const DEFAULT_BUFFER_SECONDS = 30;
export const DEFAULT_SPEAKER_THRESHOLD = 0.6;
export const DEFAULT_MAX_SPEAKERS = 8;

export const DATA_DIR = '.ciel' as const;
export const DATA_PATH = process.env.CIEL_DATA_DIR ?? path.resolve(process.cwd(), DATA_DIR);
export const AURIS_MODELS_PATH = path.join(DATA_PATH, 'models');
export const AURIS_VOICEPRINTS_PATH = path.join(DATA_PATH, 'voiceprints');

export const AURIS_MODEL_PATHS = {
  asr: path.join(AURIS_MODELS_PATH, 'asr', 'qwen3-asr-1.7b-int8'),
  vad: path.join(AURIS_MODELS_PATH, 'vad', 'ten-vad.int8.onnx'),
  speaker: path.join(AURIS_MODELS_PATH, 'speaker', 'model.onnx'),
} as const;
