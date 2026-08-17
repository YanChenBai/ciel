import type { AnyVigiliaEvent } from '@ciels/core';
import { describe, expect, it } from 'vite-plus/test';

import { buildVigiliaThoughtRuns } from '../src/vigilia/trace.ts';

describe('buildVigiliaThoughtRuns', () => {
  it('pairs a thought and its child operations into ordered steps', () => {
    const events = [
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
      event(4, 160, 'nucleus.think.completed', {
        durationMs: 60,
        operationId: 'think-1',
        output: 'done',
        trigger: 'manual',
      }),
    ] as AnyVigiliaEvent[];

    const runs = buildVigiliaThoughtRuns(events);

    expect(runs).toHaveLength(1);
    expect(runs[0]).toMatchObject({ id: 'think-1', status: 'completed' });
    expect(runs[0]?.steps).toHaveLength(2);
    expect(runs[0]?.steps[1]).toMatchObject({
      durationMs: 20,
      lane: 'memory',
      name: 'read-recent',
      output: { entries: 2 },
      status: 'completed',
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
