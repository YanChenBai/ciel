import { describe, expect, it } from 'vite-plus/test';

import { Hearing, Reading, Sight } from '#percepts';
import { Echo, Photon, Script } from '#signals';
import { Stimulus } from '#stimulus';

import { InMemoryPerceptStore } from './in-memory.ts';

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

describe('InMemoryPerceptStore', () => {
  it('appends every percept with source metadata and a monotonic sequence', () => {
    const stimulus = new TestStimulus();
    const store = new InMemoryPerceptStore();
    store.register(stimulus);

    const hearing = store.append(
      stimulus,
      new Hearing({
        content: 'hello',
        speaker: 'host',
        startAt: new Date(100),
        endAt: new Date(200),
        originSignal: TestEcho,
      }),
    );
    const sight = store.append(
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
    expect(hearing.stimulusDefinition.name).toBe('Live room');
  });

  it('keeps checkout stable until commit while accepting later records', () => {
    const stimulus = new TestStimulus();
    const store = new InMemoryPerceptStore();
    store.register(stimulus);
    const first = store.append(
      stimulus,
      new Reading({ content: 'first', timestamp: new Date(100), originSignal: TestScript }),
    );

    const checkout = store.checkout('nucleus', new Date(200));
    const later = store.append(
      stimulus,
      new Reading({ content: 'later', timestamp: new Date(300), originSignal: TestScript }),
    );

    expect(store.checkout('nucleus')).toBe(checkout);
    expect(checkout.records).toEqual([first]);
    store.commit(checkout);
    expect(store.checkout('nucleus').records).toEqual([later]);
  });

  it('maintains independent consumer cursors', () => {
    const stimulus = new TestStimulus();
    const store = new InMemoryPerceptStore();
    store.register(stimulus);
    const record = store.append(
      stimulus,
      new Reading({ content: 'once', timestamp: new Date(100), originSignal: TestScript }),
    );

    const nucleus = store.checkout('nucleus');
    const memory = store.checkout('memory');
    store.commit(nucleus);

    expect(store.checkout('nucleus').records).toEqual([]);
    expect(memory.records).toEqual([record]);
    expect(store.hasUnread('memory')).toBe(true);
  });

  it('creates isolated consumer identities and only compacts commonly committed history', () => {
    const stimulus = new TestStimulus();
    const store = new InMemoryPerceptStore();
    store.register(stimulus);
    const nucleus = store.createConsumer('nucleus');
    const memory = store.createConsumer('memory');
    expect(nucleus).not.toBe(memory);
    store.append(
      stimulus,
      new Reading({ content: 'old', timestamp: new Date(100), originSignal: TestScript }),
    );

    store.commit(store.checkout(nucleus));
    expect(store.compact(new Date(1_000), 100)).toBe(0);
    store.commit(store.checkout(memory));
    expect(store.compact(new Date(1_000), 100)).toBe(1);
    expect(store.snapshot().records).toEqual([]);
  });

  it('can build a bounded-time snapshot without advancing any cursor', () => {
    const stimulus = new TestStimulus();
    const store = new InMemoryPerceptStore();
    store.register(stimulus);
    store.append(
      stimulus,
      new Reading({ content: 'old', timestamp: new Date(100), originSignal: TestScript }),
    );
    const recent = store.append(
      stimulus,
      new Reading({ content: 'recent', timestamp: new Date(900), originSignal: TestScript }),
    );

    expect(store.snapshot(new Date(1_000), 200).records).toEqual([recent]);
    expect(store.hasUnread('nucleus')).toBe(true);
  });
});
