import { describe, expect, it, vi } from 'vite-plus/test';

import { Vigilia, VigiliaJournal, VigiliaOpenTelemetry, snapshotJson } from './index.ts';

describe('VigiliaJournal', () => {
  it('commits immutable events before publishing them', () => {
    const journal = new VigiliaJournal({ clock: () => 42 });
    const seen: number[] = [];
    journal.subscribe((event, snapshot) => {
      seen.push(event.sequence, snapshot.throughSequence);
    });

    const event = journal.record('ciel.state.changed', { from: 'idle', to: 'starting' });

    expect(event).toEqual({
      data: { from: 'idle', to: 'starting' },
      sequence: 1,
      time: 42,
      type: 'ciel.state.changed',
      version: 1,
    });
    expect(Object.isFrozen(event)).toBe(true);
    expect(Object.isFrozen(event.data)).toBe(true);
    expect(seen).toEqual([1, 1]);
  });

  it('isolates subscriber failures and rejects reentrant records', () => {
    const subscriberError = vi.fn();
    const journal = new VigiliaJournal({ onSubscriberError: subscriberError });
    const later = vi.fn();
    journal.subscribe(() => {
      expect(() =>
        journal.record('ciel.state.changed', { from: 'starting', to: 'running' }),
      ).toThrow('reentrant');
      throw new Error('subscriber failed');
    });
    journal.subscribe(later);

    journal.record('ciel.state.changed', { from: 'idle', to: 'starting' });

    expect(subscriberError).toHaveBeenCalledTimes(1);
    expect(later).toHaveBeenCalledTimes(1);
    expect(journal.events()).toHaveLength(1);
  });

  it('does not mutate history when data is not JSON-safe', () => {
    const journal = new VigiliaJournal();
    expect(() =>
      journal.record('percept.appended', {
        content: { value: Number.NaN },
        perceptType: 'Reading',
        sequence: 1,
        signal: 'script',
        stimulus: 'test',
      }),
    ).toThrow('finite JSON numbers');
    expect(journal.events()).toEqual([]);
    expect(journal.snapshot().throughSequence).toBe(0);
  });

  it('rejects a non-JSON clock value before committing', () => {
    const journal = new VigiliaJournal({ clock: () => Number.NaN });
    expect(() => journal.record('ciel.state.changed', { from: 'idle', to: 'starting' })).toThrow(
      'clock',
    );
    expect(journal.events()).toEqual([]);
  });

  it('projects totals, durations, tokens, and active operations deterministically', () => {
    const vigilia = new Vigilia();
    vigilia.record('nucleus.think.started', {
      fromSequence: 1,
      operationId: 'think:1',
      throughSequence: 2,
      trigger: 'speech-end',
    });
    expect(vigilia.snapshot().activeOperations).toHaveLength(1);
    vigilia.record('nucleus.think.completed', {
      durationMs: 25,
      inputTokens: 10,
      operationId: 'think:1',
      outputTokens: 3,
      trigger: 'speech-end',
    });

    expect(vigilia.snapshot()).toMatchObject({
      activeOperations: [],
      performance: { thinkDurationMs: 25 },
      throughSequence: 2,
      totals: { inputTokens: 10, outputTokens: 3, thoughts: 1 },
    });
    expect(() =>
      vigilia.record('nucleus.think.completed', {
        durationMs: 25,
        operationId: 'think:1',
        trigger: 'speech-end',
      }),
    ).toThrow('is not active');
    expect(vigilia.snapshot().throughSequence).toBe(2);
  });
});

describe('snapshotJson', () => {
  it('copies values and rejects circular input', () => {
    const input = { nested: { value: 'before' } };
    const result = snapshotJson(input);
    input.nested.value = 'after';
    expect(result).toEqual({ nested: { value: 'before' } });
    expect(Object.isFrozen(result)).toBe(true);

    const circular: { self?: unknown } = {};
    circular.self = circular;
    expect(() => snapshotJson(circular)).toThrow('circular reference');
    const sparse: unknown[] = [];
    sparse.length = 1;
    expect(() => snapshotJson(sparse)).toThrow('array holes');
  });
});

describe('VigiliaOpenTelemetry', () => {
  it('is a no-op when no OpenTelemetry SDK is registered', () => {
    const vigilia = new Vigilia();
    const detach = new VigiliaOpenTelemetry().attach(vigilia);

    expect(() => {
      vigilia.record('signal.processing.started', { operationId: 'signal:1', signal: 'test' });
      vigilia.record('signal.processing.completed', {
        durationMs: 1,
        operationId: 'signal:1',
        signal: 'test',
      });
    }).not.toThrow();
    detach();
  });
});
