import { describe, expect, it, vi } from 'vite-plus/test';

import {
  serializeError,
  snapshotJson,
  toVigiliaName,
  Vigilia,
  VigiliaJournal,
  VigiliaOpenTelemetry,
} from './index.ts';

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
        endAt: 2,
        perceptType: 'Reading',
        sequence: 1,
        signal: 'script',
        startAt: 1,
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

  it('requires operation names to use kebab-case', () => {
    const journal = new VigiliaJournal();
    expect(() =>
      journal.record('operation.started', {
        category: 'tool',
        name: 'Send Danmaku',
        operationId: 'tool-1',
      }),
    ).toThrow('kebab-case');
    expect(journal.events()).toEqual([]);
    expect(toVigiliaName('SendDanmaku')).toBe('send-danmaku');
  });

  it('projects totals, durations, tokens, and active operations deterministically', () => {
    const vigilia = new Vigilia();
    vigilia.observe({
      type: 'nucleus.think.started',
      data: {
        fromSequence: 1,
        operationId: 'think:1',
        throughSequence: 2,
        trigger: 'speech-end',
      },
    });
    expect(vigilia.snapshot().activeOperations).toHaveLength(1);
    vigilia.observe({
      type: 'nucleus.think.completed',
      data: {
        durationMs: 25,
        inputTokens: 10,
        operationId: 'think:1',
        outputTokens: 3,
        trigger: 'speech-end',
      },
    });

    expect(vigilia.snapshot()).toMatchObject({
      activeOperations: [],
      performance: { thinkDurationMs: 25 },
      throughSequence: 2,
      totals: { inputTokens: 10, outputTokens: 3, thoughts: 1 },
    });
    expect(() =>
      vigilia.observe({
        type: 'nucleus.think.completed',
        data: {
          durationMs: 25,
          operationId: 'think:1',
          trigger: 'speech-end',
        },
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

describe('serializeError', () => {
  it('captures bounded model output and nested validation causes', () => {
    const validationError = new Error('score must be a number');
    validationError.name = 'AI_TypeValidationError';
    const modelError = new Error('response did not match schema', { cause: validationError });
    modelError.name = 'AI_NoObjectGeneratedError';
    Object.defineProperty(modelError, 'text', { value: '{"score":"80"}' });

    expect(serializeError(modelError)).toMatchObject({
      cause: {
        message: 'score must be a number',
        name: 'AI_TypeValidationError',
      },
      message: 'response did not match schema',
      name: 'AI_NoObjectGeneratedError',
      text: '{"score":"80"}',
    });
  });

  it('truncates long model output and stops circular causes', () => {
    const modelError = new Error('invalid output');
    Object.defineProperties(modelError, {
      cause: { value: modelError },
      text: { value: 'x'.repeat(20_001) },
    });

    const serialized = serializeError(modelError);
    expect(serialized).not.toHaveProperty('cause');
    expect(serialized.text).toContain('[1 chars omitted]');
  });
});

describe('VigiliaOpenTelemetry', () => {
  it('is a no-op when no OpenTelemetry SDK is registered', () => {
    const vigilia = new Vigilia();
    const detach = new VigiliaOpenTelemetry().attach(vigilia);

    expect(() => {
      vigilia.observe({
        type: 'signal.processing.started',
        data: { operationId: 'signal:1', signal: 'test' },
      });
      vigilia.observe({
        type: 'signal.processing.completed',
        data: {
          durationMs: 1,
          operationId: 'signal:1',
          signal: 'test',
        },
      });
    }).not.toThrow();
    detach();
  });
});
