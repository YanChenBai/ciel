import type {
  OnlineRecognizerConfig,
  SpeakerEmbeddingExtractorConfig,
  VadConfig,
} from 'sherpa-onnx-node';

import type { Hearing } from '#perceptions';

export interface SpeakerProfile {
  name: string;
  file: string;
}

export interface ASROptions {
  speaker?: readonly SpeakerProfile[];
  bufferSeconds?: number;
  speakerThreshold?: number;
  maxSpeakers?: number;
}

export interface ASREventMap {
  result(data: Hearing): void;
  speechstart(at: Date): void;
  speechend(at: Date): void;
  error(error: Error): void;
}

export interface AurisModelConfig {
  recognizer: OnlineRecognizerConfig;
  vad: VadConfig;
  speaker: SpeakerEmbeddingExtractorConfig;
}
