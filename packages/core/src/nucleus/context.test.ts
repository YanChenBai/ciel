import { describe, expect, it } from 'vite-plus/test';

import { Hearing, Reading, Sight } from '#src/percepts/index.ts';
import { Echo, Photon, Script } from '#src/signals/index.ts';
import { Stimulus } from '#src/stimulus/index.ts';

import { NucleusContextStore } from './context.ts';

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

class SecondTestStimulus extends TestStimulus {
  static readonly meta = { name: 'Local room', description: 'A second scene' };
}

describe('NucleusContextStore', () => {
  it('keeps registered definitions and chronologically ordered realtime data', () => {
    const stimulus = new TestStimulus();
    const context = new NucleusContextStore(1_000);
    context.register(stimulus);
    context.ingest(
      stimulus,
      new Reading({ content: 'late', timestamp: new Date(1_900), originSignal: TestScript }),
    );
    context.ingest(
      stimulus,
      new Hearing({
        content: 'hello',
        speaker: 'host',
        startAt: new Date(1_100),
        endAt: new Date(1_200),
        originSignal: TestEcho,
      }),
    );
    context.ingest(
      stimulus,
      new Sight({
        path: 'scene.jpg',
        startAt: new Date(1_300),
        endAt: new Date(1_400),
        originSignal: TestPhoton,
      }),
    );
    context.ingest(
      stimulus,
      new Reading({ content: 'expired', timestamp: new Date(900), originSignal: TestScript }),
    );

    const snapshot = context.snapshot(new Date(2_000));
    expect(snapshot.definitions.find(definition => definition.kind === 'scene')?.name).toBe(
      'Live room',
    );
    expect(snapshot.data.map(data => data.percept.type)).toEqual(['hearing', 'sight', 'reading']);
  });

  it('merges stimuli and manages runtime definitions', () => {
    const first = new TestStimulus();
    const second = new SecondTestStimulus();
    const context = new NucleusContextStore(1_000);
    context.register(first);
    context.register(second);
    const remove = context.define({ name: 'Goal', description: 'Decide whether to interact' });
    context.ingest(
      second,
      new Reading({ content: 'second', timestamp: new Date(200), originSignal: TestScript }),
    );
    context.ingest(
      first,
      new Reading({ content: 'first', timestamp: new Date(100), originSignal: TestScript }),
    );

    const snapshot = context.snapshot(new Date(300));
    expect(
      snapshot.definitions
        .filter(definition => definition.kind === 'scene')
        .map(definition => definition.name),
    ).toEqual(['Live room', 'Local room']);
    expect(snapshot.data.map(data => data.content)).toMatchObject([
      { text: 'first' },
      { text: 'second' },
    ]);
    expect(snapshot.data.map(data => data.stimulus)).toEqual([first, second]);
    remove();
    expect(context.snapshot().definitions).not.toEqual(
      expect.arrayContaining([expect.objectContaining({ name: 'Goal' })]),
    );
  });

  it('limits realtime images and removes only an archived batch', () => {
    const stimulus = new TestStimulus();
    const context = new NucleusContextStore(1_000, 1);
    context.register(stimulus);
    const first = context.ingest(
      stimulus,
      new Sight({
        path: 'first.jpg',
        startAt: new Date(100),
        endAt: new Date(100),
        originSignal: TestPhoton,
      }),
    );
    const second = context.ingest(
      stimulus,
      new Sight({
        path: 'second.jpg',
        startAt: new Date(200),
        endAt: new Date(200),
        originSignal: TestPhoton,
      }),
    );
    const currentText = context.ingest(
      stimulus,
      new Reading({ content: 'keep', timestamp: new Date(300), originSignal: TestScript }),
    );

    expect(context.snapshot(new Date(300)).data).toEqual([second, currentText]);
    context.remove([first, second]);
    expect(context.snapshot(new Date(300)).data).toEqual([currentText]);
  });
});
