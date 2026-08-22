// @env node

import { EventEmitter, toError } from '@ciels/event';
import type { Unsubscribe } from '@ciels/event';
import sherpaOnnx from 'sherpa-onnx-node';
import type {
  CircularBuffer as CircularBufferInstance,
  OfflineRecognizer as OfflineRecognizerInstance,
  OfflineRecognizerResult,
  SpeechSegment,
  Vad as VadInstance,
} from 'sherpa-onnx-node';

import {
  AURIS_SAMPLE_RATE,
  AURIS_VAD_WINDOW_SIZE,
  DEFAULT_BUFFER_SECONDS,
  DEFAULT_MAX_SPEAKERS,
  DEFAULT_SPEAKER_THRESHOLD,
} from './constants.ts';
import { createAurisModelConfig } from './models.ts';
import { ProcessASR } from './process-asr.ts';
import { SpeakerTracker } from './speaker.ts';
import type { ASREventMap, ASROptions, ASRSegment, ASRToken } from './types.ts';

const { CircularBuffer, OfflineRecognizer, SpeakerEmbeddingExtractor, Vad } = sherpaOnnx;

export class NativeASR {
  private readonly emitter = new EventEmitter<ASREventMap>();
  private readonly buffer: CircularBufferInstance;
  private readonly bufferCapacity: number;
  private readonly recognizer: OfflineRecognizerInstance;
  private readonly speaker: SpeakerTracker;
  private readonly vad: VadInstance;
  private readonly windowSize: number;
  private streamStartAt?: Date;

  constructor(options: ASROptions = {}) {
    validateOptions(options);

    const models = createAurisModelConfig();
    const bufferSeconds = options.bufferSeconds ?? DEFAULT_BUFFER_SECONDS;
    this.bufferCapacity = Math.ceil(bufferSeconds * AURIS_SAMPLE_RATE);
    this.buffer = new CircularBuffer(this.bufferCapacity);
    this.recognizer = new OfflineRecognizer(models.recognizer);
    this.vad = new Vad(models.vad, bufferSeconds);
    this.windowSize = models.vad.tenVad?.windowSize ?? AURIS_VAD_WINDOW_SIZE;
    this.speaker = new SpeakerTracker(
      new SpeakerEmbeddingExtractor(models.speaker),
      options.speaker ?? [],
      options.speakerThreshold ?? DEFAULT_SPEAKER_THRESHOLD,
      options.maxSpeakers ?? DEFAULT_MAX_SPEAKERS,
    );
  }

  write(segment: ASRSegment): void {
    try {
      if (!this.streamStartAt) this.streamStartAt = segment.startAt;
      const samples = pcm16ToFloat32(segment.data);
      this.push(samples);
      this.processWindows();
      this.drainVad();
    } catch (error) {
      this.emit('error', toError(error));
    }
  }

  flush(): void {
    try {
      const remaining = this.buffer.size();
      if (remaining > 0) {
        const samples = this.buffer.get(this.buffer.head(), remaining);
        this.buffer.pop(remaining);
        const padded = new Float32Array(this.windowSize);
        padded.set(samples);
        this.vad.acceptWaveform(padded);
      }
      this.vad.flush();
      this.drainVad();
    } catch (error) {
      this.emit('error', toError(error));
    } finally {
      this.vad.reset();
      this.buffer.reset();
      this.streamStartAt = undefined;
    }
  }

  on<K extends keyof ASREventMap>(event: K, callback: ASREventMap[K]): Unsubscribe {
    return this.emitter.on(event, callback);
  }

  private emit<K extends keyof ASREventMap>(event: K, ...args: Parameters<ASREventMap[K]>): void {
    this.emitter.emit(event, ...args);
  }

  private push(samples: Float32Array): void {
    let offset = 0;
    while (offset < samples.length) {
      this.processWindows();
      const free = this.bufferCapacity - this.buffer.size();
      if (free === 0) throw new Error('ASR circular buffer is full');
      const length = Math.min(free, samples.length - offset);
      this.buffer.push(samples.subarray(offset, offset + length));
      offset += length;
    }
  }

  private processWindows(): void {
    while (this.buffer.size() >= this.windowSize) {
      const samples = this.buffer.get(this.buffer.head(), this.windowSize);
      this.buffer.pop(this.windowSize);
      this.vad.acceptWaveform(samples);
    }
  }

  private drainVad(): void {
    while (!this.vad.isEmpty()) {
      const segment = this.vad.front();
      this.vad.pop();
      this.transcribe(segment);
    }
  }

  private transcribe(segment: SpeechSegment): void {
    const baseAt = this.streamStartAt;
    if (!baseAt) {
      throw new Error('Cannot map ASR timestamps before audio is written');
    }

    const segmentStartAt = addSamples(baseAt, segment.start);
    const segmentEndAt = addSamples(segmentStartAt, segment.samples.length);
    this.emit('speechstart', segmentStartAt);

    const stream = this.recognizer.createStream();
    stream.acceptWaveform({
      samples: segment.samples,
      sampleRate: AURIS_SAMPLE_RATE,
    });
    this.recognizer.decode(stream);
    const result = this.recognizer.getResult(stream);
    const content = result.text.trim();
    if (content) {
      this.emit('result', {
        content,
        speaker: this.speaker.assign(segment.samples, AURIS_SAMPLE_RATE),
        confidence: averageConfidence(result),
        startAt: segmentStartAt,
        endAt: segmentEndAt,
        tokens: createTokens(result, segmentStartAt, segmentEndAt),
      });
    }
    this.emit('speechend', segmentEndAt);
  }
}

/**
 * 在普通 Node 中直接使用原生 sherpa；Electron 的 V8 memory cage 不允许
 * sherpa 返回堆外 ArrayBuffer，因此自动将识别工作移入独立 Node ESM 进程。
 */
export class ASR {
  private readonly backend: NativeASR | ProcessASR;

  constructor(options: ASROptions = {}) {
    this.backend = process.versions.electron ? new ProcessASR(options) : new NativeASR(options);
  }

  write(segment: ASRSegment): void {
    this.backend.write(segment);
  }

  flush(): void {
    this.backend.flush();
  }

  on<K extends keyof ASREventMap>(event: K, callback: ASREventMap[K]): Unsubscribe {
    return this.backend.on(event, callback);
  }

  close(): Promise<void> {
    return this.backend instanceof ProcessASR ? this.backend.close() : Promise.resolve();
  }
}

function pcm16ToFloat32(data: Buffer): Float32Array {
  if (data.length % Int16Array.BYTES_PER_ELEMENT !== 0) {
    throw new Error('Echo data must contain aligned s16le PCM samples');
  }
  const samples = new Float32Array(data.length / Int16Array.BYTES_PER_ELEMENT);
  for (let index = 0; index < samples.length; index += 1) {
    const value = data.readInt16LE(index * Int16Array.BYTES_PER_ELEMENT);
    samples[index] = value < 0 ? value / 32_768 : value / 32_767;
  }
  return samples;
}

function createTokens(
  result: OfflineRecognizerResult,
  segmentStartAt: Date,
  segmentEndAt: Date,
): readonly ASRToken[] | undefined {
  if (result.tokens.length === 0 || result.timestamps.length === 0) {
    return undefined;
  }
  return result.tokens.map((content, index) => {
    const startAt = addSeconds(segmentStartAt, result.timestamps[index] ?? 0);
    const duration = result.durations[index];
    const nextTimestamp = result.timestamps[index + 1];
    return {
      content,
      startAt,
      endAt:
        duration !== undefined
          ? addSeconds(startAt, duration)
          : nextTimestamp === undefined
            ? segmentEndAt
            : addSeconds(segmentStartAt, nextTimestamp),
    };
  });
}

function averageConfidence(result: OfflineRecognizerResult): number | undefined {
  const probabilities = result.ys_log_probs.filter(Number.isFinite).map(Math.exp);
  if (probabilities.length === 0) return undefined;
  return probabilities.reduce((sum, value) => sum + value, 0) / probabilities.length;
}

function addSamples(at: Date, samples: number): Date {
  return addSeconds(at, samples / AURIS_SAMPLE_RATE);
}

function addSeconds(at: Date, seconds: number): Date {
  return new Date(at.getTime() + seconds * 1_000);
}

function validateOptions(options: ASROptions): void {
  if (
    options.bufferSeconds !== undefined &&
    options.bufferSeconds < AURIS_VAD_WINDOW_SIZE / AURIS_SAMPLE_RATE
  ) {
    throw new Error(
      `bufferSeconds must hold at least one ${AURIS_VAD_WINDOW_SIZE}-sample VAD window`,
    );
  }
  if (
    options.speakerThreshold !== undefined &&
    !(options.speakerThreshold > 0 && options.speakerThreshold <= 1)
  ) {
    throw new Error('speakerThreshold must be greater than 0 and at most 1');
  }
  if (
    options.maxSpeakers !== undefined &&
    (!Number.isInteger(options.maxSpeakers) || options.maxSpeakers < 1)
  ) {
    throw new Error('maxSpeakers must be a positive integer');
  }
}
