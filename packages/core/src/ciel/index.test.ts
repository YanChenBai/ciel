import { describe, expect, it, vi } from 'vite-plus/test';

import { Reading } from '#src/percepts/index.ts';
import { Echo, Photon, Script } from '#src/signals/index.ts';
import { Stimulus } from '#src/stimulus/index.ts';

const processorState = vi.hoisted(() => ({
  closes: 0,
  echoes: [] as unknown[],
  photons: [] as unknown[],
  sensusSignals: [] as (readonly unknown[])[],
}));

vi.mock('#sensus', async () => {
  const { EventHost } = await import('@ciels/event');
  return {
    Sensus: class extends EventHost<{
      data(data: unknown): void;
      error(error: Error): void;
    }> {
      constructor(options: { signals: readonly unknown[] }) {
        super();
        processorState.sensusSignals.push(options.signals);
      }

      async process(signal: unknown): Promise<void> {
        const value = signal as { type: string };
        if (value.type === 'echo') {
          processorState.echoes.push(signal);
        } else if (value.type === 'photon') {
          await Promise.resolve();
          processorState.photons.push(signal);
        } else if (value.type === 'script') {
          const script = signal as Script;
          this.emit(
            'data',
            new Reading({
              content: script.content,
              timestamp: script.timestamp,
              originSignal: script.constructor as typeof Script,
            }),
          );
        }
      }

      close(): void {
        processorState.closes += 1;
      }
    },
  };
});

const { Ciel } = await import('./index.ts');

class TestEcho extends Echo.WithMeta({
  name: 'Test audio',
  description: 'Audio emitted by a test stimulus',
}) {}

class TestPhoton extends Photon.WithMeta({
  name: 'Test video',
  description: 'Video emitted by a test stimulus',
}) {}

class TestScript extends Script.WithMeta({
  name: 'Test text',
  description: 'Text emitted by a test stimulus',
}) {}

const testSignals = [TestEcho, TestPhoton, TestScript] as const;

class TestStimulus extends Stimulus<typeof testSignals> {
  readonly signals = testSignals;
  started = false;
  stopped = false;

  async start(): Promise<void> {
    this.started = true;
    await this.send(
      new TestEcho({
        data: Buffer.alloc(2),
        startAt: new Date(0),
        endAt: new Date(1),
      }),
    );
    await this.send(new TestPhoton({ data: Buffer.alloc(0), timestamp: new Date(0) }));
    await this.send(new TestScript({ content: 'hello', timestamp: new Date(0) }));
  }

  stop(): void {
    this.stopped = true;
  }
}

describe('Ciel', () => {
  it('discovers signals and routes emitted instances to automatic processors', async () => {
    const stimulus = new TestStimulus();
    const readings: Reading[] = [];
    const ciel = new Ciel().use(stimulus);
    ciel.on('data', percept => {
      if (percept.type === 'reading') {
        readings.push(percept);
      }
    });

    await ciel.start();

    expect(stimulus.started).toBe(true);
    expect(processorState.sensusSignals).toEqual([testSignals]);
    expect(processorState.echoes[0]).toBeInstanceOf(TestEcho);
    expect(processorState.photons[0]).toBeInstanceOf(TestPhoton);
    expect(readings[0]).toMatchObject({
      content: 'hello',
      originSignal: TestScript,
    });

    await ciel.stop();
    expect(stimulus.stopped).toBe(true);
    expect(processorState.closes).toBe(1);
  });

  it('creates an isolated Sensus for each stimulus', async () => {
    processorState.sensusSignals.length = 0;
    const ciel = new Ciel().use(new TestStimulus()).use(new TestStimulus());

    await ciel.start();

    expect(processorState.sensusSignals).toEqual([testSignals, testSignals]);
    await ciel.stop();
  });
});
