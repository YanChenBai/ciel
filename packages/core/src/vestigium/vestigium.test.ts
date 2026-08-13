import { describe, expect, it } from 'vite-plus/test';

import { Hearing, Reading, Sight } from '#src/percepts/index.ts';
import { Echo, Photon, Script } from '#src/signals/index.ts';
import { Stimulus } from '#src/stimulus/index.ts';

import { Vestigium } from './vestigium.ts';

class TestEcho extends Echo.WithMeta({ name: 'Voice', description: 'Recognized speech' }) {}
class TestPhoton extends Photon.WithMeta({ name: 'View', description: 'Visual snapshots' }) {}
class TestScript extends Script.WithMeta({ name: 'Chat', description: 'Viewer messages' }) {}
const signals = [TestEcho, TestPhoton, TestScript] as const;

class TestStimulus extends Stimulus<typeof signals> {
  static readonly meta = { name: 'Live room', description: 'A live-stream scene' };
  readonly signals = signals;
  start(): void {}
  stop(): void {}
}

describe('Vestigium', () => {
  it('appends every percept with source metadata and a monotonic sequence', () => {
    const stimulus = new TestStimulus();
    const vestigium = new Vestigium();
    vestigium.register(stimulus);

    const hearing = vestigium.append(
      stimulus,
      new Hearing({
        content: 'hello',
        speaker: 'host',
        startAt: new Date(100),
        endAt: new Date(200),
        originSignal: TestEcho,
      }),
    );
    const sight = vestigium.append(
      stimulus,
      new Sight({
        path: 'scene.jpg',
        startAt: new Date(300),
        endAt: new Date(400),
        originSignal: TestPhoton,
      }),
    );

    expect([hearing.sequence, sight.sequence]).toEqual([1, 2]);
    expect(hearing.content).toEqual({ type: 'text', text: 'hello', speaker: 'host' });
    expect(sight.content).toEqual({ type: 'image', path: 'scene.jpg' });
    expect(hearing.scene.name).toBe('Live room');
  });

  it('keeps checkout stable until commit while accepting later records', () => {
    const stimulus = new TestStimulus();
    const vestigium = new Vestigium();
    vestigium.register(stimulus);
    const first = vestigium.append(
      stimulus,
      new Reading({ content: 'first', timestamp: new Date(100), originSignal: TestScript }),
    );

    const checkout = vestigium.checkout('nucleus', new Date(200));
    const later = vestigium.append(
      stimulus,
      new Reading({ content: 'later', timestamp: new Date(300), originSignal: TestScript }),
    );

    expect(vestigium.checkout('nucleus')).toBe(checkout);
    expect(checkout.records).toEqual([first]);
    vestigium.commit(checkout);
    expect(vestigium.checkout('nucleus').records).toEqual([later]);
  });

  it('maintains independent consumer cursors', () => {
    const stimulus = new TestStimulus();
    const vestigium = new Vestigium();
    vestigium.register(stimulus);
    const record = vestigium.append(
      stimulus,
      new Reading({ content: 'once', timestamp: new Date(100), originSignal: TestScript }),
    );

    const nucleus = vestigium.checkout('nucleus');
    const memory = vestigium.checkout('memory');
    vestigium.commit(nucleus);

    expect(vestigium.checkout('nucleus').records).toEqual([]);
    expect(memory.records).toEqual([record]);
    expect(vestigium.hasUnread('memory')).toBe(true);
  });

  it('creates isolated consumer identities and only compacts commonly committed history', () => {
    const stimulus = new TestStimulus();
    const vestigium = new Vestigium();
    vestigium.register(stimulus);
    const nucleus = vestigium.createConsumer('nucleus');
    const memory = vestigium.createConsumer('memory');
    expect(nucleus).not.toBe(memory);
    vestigium.append(
      stimulus,
      new Reading({ content: 'old', timestamp: new Date(100), originSignal: TestScript }),
    );

    vestigium.commit(vestigium.checkout(nucleus));
    expect(vestigium.compact(new Date(1_000), 100)).toBe(0);
    vestigium.commit(vestigium.checkout(memory));
    expect(vestigium.compact(new Date(1_000), 100)).toBe(1);
    expect(vestigium.snapshot().records).toEqual([]);
  });

  it('can build a bounded-time snapshot without advancing any cursor', () => {
    const stimulus = new TestStimulus();
    const vestigium = new Vestigium();
    vestigium.register(stimulus);
    vestigium.append(
      stimulus,
      new Reading({ content: 'old', timestamp: new Date(100), originSignal: TestScript }),
    );
    const recent = vestigium.append(
      stimulus,
      new Reading({ content: 'recent', timestamp: new Date(900), originSignal: TestScript }),
    );

    expect(vestigium.snapshot(new Date(1_000), 200).records).toEqual([recent]);
    expect(vestigium.hasUnread('nucleus')).toBe(true);
  });
});
