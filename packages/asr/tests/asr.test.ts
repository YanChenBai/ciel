import { describe, expect, it, vi } from 'vite-plus/test';

vi.mock('sherpa-onnx-node', () => {
  class FakeStream {
    decoded = false;

    acceptWaveform(): void {}

    inputFinished(): void {}
  }

  class CircularBuffer {
    private readonly samples: number[] = [];

    push(samples: Float32Array): void {
      this.samples.push(...samples);
    }

    get(start: number, length: number): Float32Array {
      return Float32Array.from(this.samples.slice(start, start + length));
    }

    pop(length: number): void {
      this.samples.splice(0, length);
    }

    size(): number {
      return this.samples.length;
    }

    head(): number {
      return 0;
    }

    reset(): void {
      this.samples.length = 0;
    }
  }

  class Vad {
    private readonly segments: {
      start: number;
      samples: Float32Array;
    }[] = [];

    acceptWaveform(): void {}

    flush(): void {
      this.segments.push({
        start: 1_600,
        samples: new Float32Array(16_000),
      });
    }

    isEmpty(): boolean {
      return this.segments.length === 0;
    }

    front(): { start: number; samples: Float32Array } {
      return this.segments[0]!;
    }

    pop(): void {
      this.segments.shift();
    }

    reset(): void {
      this.segments.length = 0;
    }
  }

  class OfflineRecognizer {
    createStream(): FakeStream {
      return new FakeStream();
    }

    decode(stream: FakeStream): void {
      stream.decoded = true;
    }

    getResult(): object {
      return {
        text: 'language Chinese<asr_text>你好',
        lang: '<|zh|>',
        emotion: '<|NEUTRAL|>',
        event: '<|Speech|>',
        tokens: [],
        timestamps: [],
        durations: [],
        ys_log_probs: [],
        words: [],
      };
    }
  }

  class SpeakerEmbeddingExtractor {
    readonly dim = 2;

    createStream(): FakeStream {
      return new FakeStream();
    }

    isReady(): boolean {
      return true;
    }

    compute(): Float32Array {
      return Float32Array.of(1, 0);
    }
  }

  return {
    default: {
      CircularBuffer,
      OfflineRecognizer,
      SpeakerEmbeddingExtractor,
      Vad,
    },
  };
});

const { ASR } = await import('../src/asr.ts');

describe('ASR', () => {
  it('emits timestamped final results with a stable speaker', () => {
    const asr = new ASR();
    const results: import('../src/types.ts').ASRResult[] = [];
    asr.on('result', result => results.push(result));

    const startAt = new Date('2026-08-09T00:00:00.000Z');
    asr.write({
      data: Buffer.alloc(1_024),
      startAt,
    });
    asr.flush();

    expect(results).toHaveLength(1);
    expect(results[0]).toMatchObject({
      content: '你好',
      speaker: 'speaker_0',
      startAt: new Date('2026-08-09T00:00:00.100Z'),
      endAt: new Date('2026-08-09T00:00:01.100Z'),
    });
    expect(results[0]!.confidence).toBeUndefined();
    expect(results[0]!.tokens).toBeUndefined();
  });

  it('emits input errors without throwing from write', () => {
    const asr = new ASR();
    const errors: Error[] = [];
    asr.on('error', error => errors.push(error));

    asr.write({
      data: Buffer.alloc(1),
      startAt: new Date(0),
    });

    expect(errors[0]?.message).toContain('aligned s16le');
  });
});
