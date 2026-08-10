import { describe, expect, it, vi } from 'vite-plus/test';

import { Echo } from '#signals';

vi.mock('@ciels/asr', () => ({
  ASR: class {
    private readonly listeners = new Map<string, (value: unknown) => void>();

    on(event: string, callback: (value: unknown) => void): () => void {
      this.listeners.set(event, callback);
      return () => this.listeners.delete(event);
    }

    write(segment: { startAt: Date }): void {
      this.listeners.get('result')?.({
        content: '你好',
        speaker: 'speaker_0',
        startAt: segment.startAt,
        endAt: new Date(segment.startAt.getTime() + 1_000),
      });
    }

    flush(): void {}
  },
}));

const { Auris } = await import('./index.ts');

class TestEcho extends Echo.WithMeta({
  title: 'Test audio',
  description: 'Synthetic PCM used by Auris tests',
}) {}

class OtherEcho extends Echo.WithMeta({
  title: 'Other audio',
  description: 'A different audio signal',
}) {}

describe('Auris', () => {
  it('wraps ASR results as Hearing with Echo metadata', () => {
    const auris = new Auris({ signal: TestEcho });
    const results: import('#perceptions').Hearing[] = [];
    auris.on('hearing', hearing => results.push(hearing));

    const startAt = new Date('2026-08-10T00:00:00.000Z');
    auris.observe(
      new TestEcho({
        data: Buffer.alloc(2),
        startAt,
        endAt: new Date(startAt.getTime() + 1),
      }),
    );

    expect(results[0]).toMatchObject({
      content: '你好',
    });
    expect(results[0]?.signal).toBe(TestEcho);
    expect(results[0]?.signal.meta).toEqual({
      title: 'Test audio',
      description: 'Synthetic PCM used by Auris tests',
    });
  });

  it('rejects Echo instances from a different signal', () => {
    const auris = new Auris({ signal: TestEcho });
    const errors: Error[] = [];
    auris.on('error', error => errors.push(error));

    auris.observe(
      new OtherEcho({
        data: Buffer.alloc(2),
        startAt: new Date(0),
        endAt: new Date(1),
      }),
    );

    expect(errors[0]?.message).toContain('bound signal');
  });
});
