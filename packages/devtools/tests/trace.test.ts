import type { AnyVigiliaEvent } from '@ciels/core';
import { describe, expect, it } from 'vite-plus/test';

import { buildVigiliaThoughtRuns } from '../src/lib/trace.ts';

describe('buildVigiliaThoughtRuns', () => {
  it('pairs a thought and its child operations into ordered steps', () => {
    const events = [
      event(0, 90, 'percept.appended', {
        content: '你好，介绍一下你自己',
        perceptType: 'Hearing',
        sequence: 1,
        signal: 'Echo',
        stimulus: 'Microphone',
      }),
      event(1, 100, 'nucleus.think.started', {
        fromSequence: 0,
        operationId: 'think-1',
        throughSequence: 1,
        trigger: 'manual',
      }),
      event(2, 110, 'operation.started', {
        category: 'memory',
        name: 'read-recent',
        operationId: 'memory-1',
        parentOperationId: 'think-1',
      }),
      event(3, 130, 'operation.completed', {
        category: 'memory',
        detail: { entries: 2 },
        durationMs: 20,
        name: 'read-recent',
        operationId: 'memory-1',
        parentOperationId: 'think-1',
      }),
      event(4, 135, 'operation.started', {
        category: 'tool',
        detail: { query: 'weather' },
        name: 'search-weather',
        operationId: 'tool-1',
        parentOperationId: 'memory-1',
      }),
      event(5, 150, 'operation.completed', {
        category: 'tool',
        detail: { temperature: 28 },
        durationMs: 15,
        name: 'search-weather',
        operationId: 'tool-1',
        parentOperationId: 'memory-1',
      }),
      event(6, 160, 'nucleus.think.completed', {
        durationMs: 60,
        operationId: 'think-1',
        output: 'done',
        trigger: 'manual',
      }),
    ] as AnyVigiliaEvent[];

    const runs = buildVigiliaThoughtRuns(events);

    expect(runs).toHaveLength(1);
    expect(runs[0]).toMatchObject({ id: 'think-1', status: 'completed' });
    expect(runs[0]?.inputPercepts).toEqual([
      expect.objectContaining({ content: '你好，介绍一下你自己', perceptType: 'Hearing' }),
    ]);
    expect(runs[0]?.output).toBe('done');
    expect(runs[0]?.steps).toHaveLength(3);
    expect(runs[0]?.steps[1]).toMatchObject({
      durationMs: 20,
      lane: 'memory',
      name: 'read-recent',
      output: { entries: 2 },
      status: 'completed',
    });
    expect(runs[0]?.steps[2]).toMatchObject({
      lane: 'tool',
      name: 'search-weather',
      parentId: 'memory-1',
    });
  });
});

function event<TType extends AnyVigiliaEvent['type']>(
  sequence: number,
  time: number,
  type: TType,
  data: Extract<AnyVigiliaEvent, { type: TType }>['data'],
) {
  return { data, sequence, time, type, version: 1 };
}
