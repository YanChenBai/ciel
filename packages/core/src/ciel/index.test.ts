import { describe, expect, it, vi } from 'vite-plus/test';

import { Echo, Photon, Script } from '#src/signals/index.ts';
import { Stimulus } from '#src/stimulus/index.ts';

const processorState = vi.hoisted(() => ({
  aurisSignals: [] as unknown[],
  echoes: [] as unknown[],
  flushes: 0,
  oculusSignals: [] as unknown[],
  photons: [] as unknown[],
}));

vi.mock('../auris/index.ts', async () => {
  const { EventHost } = await import('@ciels/event');
  return {
    Auris: class extends EventHost<{
      error(error: Error): void;
      hearing(data: unknown): void;
    }> {
      constructor(options: { signal: unknown }) {
        super();
        processorState.aurisSignals.push(options.signal);
      }

      observe(signal: unknown): void {
        processorState.echoes.push(signal);
      }

      flush(): void {
        processorState.flushes += 1;
      }
    },
  };
});

vi.mock('../oculus/index.ts', async () => {
  const { EventHost } = await import('@ciels/event');
  return {
    Oculus: class extends EventHost<{
      sight(data: unknown): void;
    }> {
      constructor(options: { signal: unknown }) {
        super();
        processorState.oculusSignals.push(options.signal);
      }

      async observe(signal: unknown): Promise<void> {
        await Promise.resolve();
        processorState.photons.push(signal);
      }
    },
  };
});

const { Ciel } = await import('./index.ts');

class TestEcho extends Echo.WithMeta({
  title: 'Test audio',
  description: 'Audio emitted by a test stimulus',
}) {}

class TestPhoton extends Photon.WithMeta({
  title: 'Test video',
  description: 'Video emitted by a test stimulus',
}) {}

class TestScript extends Script.WithMeta({
  title: 'Test text',
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
    const scripts: Script[] = [];
    const ciel = new Ciel().use(stimulus);
    ciel.on('script', script => scripts.push(script));

    await ciel.start();

    expect(stimulus.started).toBe(true);
    expect(processorState.aurisSignals).toEqual([TestEcho]);
    expect(processorState.oculusSignals).toEqual([TestPhoton]);
    expect(processorState.echoes[0]).toBeInstanceOf(TestEcho);
    expect(processorState.photons[0]).toBeInstanceOf(TestPhoton);
    expect(scripts[0]).toBeInstanceOf(TestScript);

    await ciel.stop();
    expect(stimulus.stopped).toBe(true);
    expect(processorState.flushes).toBe(1);
  });

  it('creates isolated processors for each stimulus binding', async () => {
    processorState.aurisSignals.length = 0;
    processorState.oculusSignals.length = 0;
    const ciel = new Ciel().use(new TestStimulus()).use(new TestStimulus());

    await ciel.start();

    expect(processorState.aurisSignals).toEqual([TestEcho, TestEcho]);
    expect(processorState.oculusSignals).toEqual([TestPhoton, TestPhoton]);
    await ciel.stop();
  });
});
