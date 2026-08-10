import { MockLanguageModelV3 } from 'ai/test';
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

function createModel(text = '保持安静'): MockLanguageModelV3 {
  return new MockLanguageModelV3({
    doGenerate: {
      content: [{ type: 'text', text }],
      finishReason: { unified: 'stop', raw: undefined },
      usage: {
        inputTokens: { total: 1, noCache: 1, cacheRead: 0, cacheWrite: 0 },
        outputTokens: { total: 1, text: 1, reasoning: 0 },
      },
      warnings: [],
    },
  });
}

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
  static readonly meta = {
    name: 'Test scene',
    description: 'Scene emitted by a test stimulus',
  };

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
    expect(ciel.getContext(stimulus).snapshot(new Date(1)).data).toHaveLength(1);

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

  it('keeps a separate context for each stimulus', () => {
    const first = new TestStimulus();
    const second = new TestStimulus();
    const ciel = new Ciel().use(first).use(second);

    expect(ciel.getContext(first)).not.toBe(ciel.getContext(second));
  });

  it('owns one Nucleus and forwards its thoughts', async () => {
    const stimulus = new TestStimulus();
    const model = createModel();
    const ciel = new Ciel({
      context: { perceptWindow: Number.MAX_SAFE_INTEGER },
      nucleus: { model },
    }).use(stimulus);
    const thoughts: unknown[] = [];
    ciel.on('thought', output => {
      thoughts.push(output);
    });

    await ciel.start();
    const nucleus = ciel.getNucleus();
    await vi.waitFor(() => expect(model.doGenerateCalls).toHaveLength(1));

    expect(nucleus).toBe(ciel.getNucleus());
    expect(thoughts).toContain('保持安静');

    await ciel.stop();
  });

  it('rejects Nucleus access when it is not configured', () => {
    const stimulus = new TestStimulus();
    const ciel = new Ciel().use(stimulus);

    expect(() => ciel.getNucleus()).toThrow('Ciel has no Nucleus configuration');
  });
});
