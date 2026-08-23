import { describe, expect, it, vi } from 'vite-plus/test';

import type { Reading } from '#percepts';
import { Echo, Photon, Script } from '#signals';
import type { VigiliaObservation } from '#vigilia';

const capabilityState = vi.hoisted(() => ({
  aurisSignals: [] as unknown[],
  echoes: [] as unknown[],
  flushes: 0,
  oculusSignals: [] as unknown[],
  photons: [] as unknown[],
}));

vi.mock('./auris.ts', async () => {
  const { EventHost } = await import('@ciels/event');
  return {
    Auris: class extends EventHost<{
      data(data: unknown): void;
      error(error: Error): void;
      speechend(at: Date): void;
    }> {
      constructor(signal: unknown) {
        super();
        capabilityState.aurisSignals.push(signal);
      }

      process(signal: unknown): void {
        capabilityState.echoes.push(signal);
        this.emit('speechend', new Date(1));
      }

      close(): void {
        capabilityState.flushes += 1;
      }
    },
  };
});

vi.mock('./oculus/index.ts', async () => {
  const { EventHost } = await import('@ciels/event');
  return {
    Oculus: class extends EventHost<{
      data(data: unknown): void;
      error(error: Error): void;
    }> {
      constructor(signal: unknown) {
        super();
        capabilityState.oculusSignals.push(signal);
      }

      async process(signal: unknown): Promise<void> {
        await Promise.resolve();
        capabilityState.photons.push(signal);
      }

      close(): void {}
    },
  };
});

const { Sensus } = await import('./sensus.ts');

class TestEcho extends Echo.WithMeta({
  name: '直播声音',
  description: 'Audio emitted by a test stimulus',
}) {}

class TestPhoton extends Photon.WithMeta({
  name: '直播画面',
  description: 'Video emitted by a test stimulus',
}) {}

class TestScript extends Script.WithMeta({
  name: '直播文字',
  description: 'Text emitted by a test stimulus',
}) {}

const signals = [TestEcho, TestPhoton, TestScript] as const;

describe('Sensus', () => {
  it('unifies all declared sensory capabilities', async () => {
    const sensus = new Sensus({ signals });
    const readings: Reading[] = [];
    const observations: VigiliaObservation[] = [];
    const speechEnds: Date[] = [];
    sensus.on('data', percept => {
      if (percept.type === 'reading') {
        readings.push(percept);
      }
    });
    sensus.on('speechend', at => speechEnds.push(at));
    sensus.observations.subscribe(observation => observations.push(observation));

    const echo = new TestEcho({
      data: Buffer.alloc(2),
      startAt: new Date(0),
      endAt: new Date(1),
    });
    const photon = new TestPhoton({
      data: Buffer.alloc(0),
      timestamp: new Date(0),
    });
    const script = new TestScript({
      content: 'hello',
      timestamp: new Date(0),
    });

    await sensus.process(echo);
    await sensus.process(photon);
    await sensus.process(script);

    expect(capabilityState.aurisSignals).toEqual([TestEcho]);
    expect(capabilityState.oculusSignals).toEqual([TestPhoton]);
    expect(capabilityState.echoes).toEqual([echo]);
    expect(capabilityState.photons).toEqual([photon]);
    expect(readings).toHaveLength(1);
    expect(readings[0]).toMatchObject({
      content: 'hello',
      timestamp: script.timestamp,
      originSignal: TestScript,
    });
    expect(speechEnds).toEqual([new Date(1)]);
    const operationNames = observations.flatMap(observation => {
      if (observation.type !== 'operation.started') return [];
      return [observation.data.name];
    });
    expect(operationNames).toEqual(['audio-ingest', 'image-ingest', 'text-ingest']);
    await sensus.close();
    expect(capabilityState.flushes).toBe(1);
  });

  it('rejects duplicate signal classes', () => {
    const aurisCount = capabilityState.aurisSignals.length;

    expect(() => new Sensus({ signals: [TestEcho, TestEcho] })).toThrow(
      'TestEcho is declared more than once',
    );
    expect(capabilityState.aurisSignals).toHaveLength(aurisCount);
  });

  it('reports signals outside its declared capabilities', async () => {
    const sensus = new Sensus({ signals: [TestEcho] });
    const errors: Error[] = [];
    sensus.on('error', error => errors.push(error));

    await sensus.process(
      new TestScript({
        content: 'hello',
        timestamp: new Date(0),
      }),
    );

    expect(errors[0]?.message).toBe('TestScript is not declared in Sensus signals');
    await sensus.close();
  });
});
