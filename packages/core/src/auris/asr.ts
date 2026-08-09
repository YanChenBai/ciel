// @env node

import sherpaOnnx from 'sherpa-onnx-node';
import type {
  CircularBuffer as CircularBufferInstance,
  OnlineRecognizer as OnlineRecognizerInstance,
  OnlineRecognizerResult,
  SpeechSegment,
  Vad as VadInstance,
} from 'sherpa-onnx-node';

import { NanoEvents } from '#/events/index.ts';
import { Hearing } from '#perceptions';
import type { HearingToken } from '#perceptions';
import type { Echo } from '#signals';

import {
  AURIS_SAMPLE_RATE,
  DEFAULT_BUFFER_SECONDS,
  DEFAULT_MAX_SPEAKERS,
  DEFAULT_SPEAKER_THRESHOLD,
} from './constants.ts';
import { createAurisModelConfig } from './models.ts';
import { SpeakerTracker } from './speaker.ts';
import type { ASREventMap, ASROptions } from './types.ts';

const { CircularBuffer, OnlineRecognizer, SpeakerEmbeddingExtractor, Vad } = sherpaOnnx;

export class ASR extends NanoEvents<ASREventMap> {
  private readonly buffer: CircularBufferInstance;
  private readonly bufferCapacity: number;
  private readonly recognizer: OnlineRecognizerInstance;
  private readonly speaker: SpeakerTracker;
  private readonly vad: VadInstance;
  private readonly windowSize: number;
  private streamStartAt?: Date;

  constructor(options: ASROptions = {}) {
    super();
    validateOptions(options);

    const models = createAurisModelConfig();
    const bufferSeconds = options.bufferSeconds ?? DEFAULT_BUFFER_SECONDS;
    this.bufferCapacity = Math.ceil(bufferSeconds * AURIS_SAMPLE_RATE);
    this.buffer = new CircularBuffer(this.bufferCapacity);
    this.recognizer = new OnlineRecognizer(models.recognizer);
    this.vad = new Vad(models.vad, bufferSeconds);
    this.windowSize = models.vad.sileroVad?.windowSize ?? 512;
    this.speaker = new SpeakerTracker(
      new SpeakerEmbeddingExtractor(models.speaker),
      options.speaker ?? [],
      options.speakerThreshold ?? DEFAULT_SPEAKER_THRESHOLD,
      options.maxSpeakers ?? DEFAULT_MAX_SPEAKERS,
    );
  }

  write(echo: Echo): void {
    try {
      if (!this.streamStartAt) this.streamStartAt = echo.startAt;
      this.push(pcm16ToFloat32(echo.data));
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
    stream.inputFinished();
    while (this.recognizer.isReady(stream)) this.recognizer.decode(stream);
    const result = this.recognizer.getResult(stream);
    const content = result.text.trim();
    if (content) {
      this.emit(
        'result',
        new Hearing({
          content,
          speaker: this.speaker.assign(segment.samples, AURIS_SAMPLE_RATE),
          confidence: averageConfidence(result),
          startAt: segmentStartAt,
          endAt: segmentEndAt,
          tokens: createTokens(result, segmentStartAt, segmentEndAt),
        }),
      );
    }
    this.emit('speechend', segmentEndAt);
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
  result: OnlineRecognizerResult,
  segmentStartAt: Date,
  segmentEndAt: Date,
): readonly HearingToken[] | undefined {
  if (result.tokens.length === 0 || result.timestamps.length === 0) {
    return undefined;
  }
  return result.tokens.map((content, index) => {
    const startAt = addSeconds(segmentStartAt, result.timestamps[index] ?? 0);
    const nextTimestamp = result.timestamps[index + 1];
    return {
      content,
      startAt,
      endAt: nextTimestamp === undefined ? segmentEndAt : addSeconds(segmentStartAt, nextTimestamp),
    };
  });
}

function averageConfidence(result: OnlineRecognizerResult): number | undefined {
  const probabilities = result.ys_probs.filter(Number.isFinite);
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
  if (options.bufferSeconds !== undefined && options.bufferSeconds < 512 / AURIS_SAMPLE_RATE) {
    throw new Error('bufferSeconds must hold at least one 512-sample VAD window');
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

function toError(error: unknown): Error {
  return error instanceof Error ? error : new Error(String(error));
}
