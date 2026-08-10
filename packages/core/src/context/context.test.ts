import { describe, expect, it } from 'vite-plus/test';

import { Hearing, Reading, Sight } from '#percepts';
import { Echo, Photon, Script } from '#signals';
import { Stimulus } from '#src/stimulus/index.ts';

import { ContextCollection } from './collection.ts';
import { Context } from './context.ts';

class TestEcho extends Echo.WithMeta({
  name: 'Voice',
  description: 'Speech recognized from the scene',
}) {}

class TestPhoton extends Photon.WithMeta({
  name: 'View',
  description: 'Visual snapshots of the scene',
}) {}

class TestScript extends Script.WithMeta({
  name: 'Chat',
  description: 'Text sent by viewers',
}) {}

const signals = [TestEcho, TestPhoton, TestScript] as const;

class TestStimulus extends Stimulus<typeof signals> {
  static readonly meta = {
    name: 'Live room',
    description: 'A continuously observed live-stream scene',
  };

  readonly signals = signals;

  start(): void {}
  stop(): void {}
}

class SecondTestStimulus extends TestStimulus {
  static readonly meta = {
    name: 'Local room',
    description: 'A second observed scene',
  };
}

describe('Context', () => {
  it('keeps definitions separate from chronologically ordered percept data', () => {
    const context = new Context(new TestStimulus(), { perceptWindow: 1_000 });
    context.ingest(
      new Reading({
        content: 'late message',
        timestamp: new Date(1_900),
        originSignal: TestScript,
      }),
    );
    context.ingest(
      new Hearing({
        content: 'hello',
        speaker: 'host',
        startAt: new Date(1_100),
        endAt: new Date(1_200),
        originSignal: TestEcho,
      }),
    );
    context.ingest(
      new Sight({
        path: 'scene.jpg',
        startAt: new Date(1_300),
        endAt: new Date(1_400),
        originSignal: TestPhoton,
      }),
    );
    context.ingest(
      new Reading({
        content: 'expired',
        timestamp: new Date(900),
        originSignal: TestScript,
      }),
    );

    const snapshot = context.snapshot(new Date(2_000));

    expect(snapshot.definitions.find(definition => definition.kind === 'scene')?.name).toBe(
      'Live room',
    );
    expect(
      snapshot.definitions
        .filter(definition => definition.kind === 'signal')
        .map(signal => signal.name),
    ).toEqual(['Voice', 'View', 'Chat']);
    expect(snapshot.data.map(data => data.percept.type)).toEqual(['hearing', 'sight', 'reading']);
    expect(context.size).toBe(3);
  });

  it('adds and removes runtime definitions', () => {
    const context = new Context(new TestStimulus());
    const remove = context.define({
      name: 'Current goal',
      description: 'Observe whether the host needs assistance',
    });

    expect(context.snapshot().definitions).toEqual(
      expect.arrayContaining([expect.objectContaining({ kind: 'custom', name: 'Current goal' })]),
    );

    remove();
    expect(context.snapshot().definitions).not.toEqual(
      expect.arrayContaining([expect.objectContaining({ name: 'Current goal' })]),
    );
  });

  it('merges all stimulus contexts for a single Nucleus', () => {
    const first = new Context(new TestStimulus(), { perceptWindow: 1_000 });
    const second = new Context(new SecondTestStimulus(), { perceptWindow: 1_000 });
    const collection = new ContextCollection();
    collection.add(first);
    collection.add(second);
    second.ingest(
      new Reading({ content: 'second', timestamp: new Date(200), originSignal: TestScript }),
    );
    first.ingest(
      new Reading({ content: 'first', timestamp: new Date(100), originSignal: TestScript }),
    );

    const snapshot = collection.snapshot(new Date(300));

    expect(
      snapshot.definitions
        .filter(definition => definition.kind === 'scene')
        .map(scene => scene.name),
    ).toEqual(['Live room', 'Local room']);
    expect(snapshot.definitions.filter(definition => definition.kind === 'signal')).toHaveLength(3);
    expect(snapshot.data.map(data => data.content)).toMatchObject([
      { text: 'first' },
      { text: 'second' },
    ]);
  });
});
