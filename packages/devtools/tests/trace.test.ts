import type { AnyVigiliaEvent } from '@ciels/core';
import { describe, expect, it } from 'vite-plus/test';

import {
  buildVigiliaConversationEntries,
  buildVigiliaSignalSteps,
  buildVigiliaThoughtRuns,
} from '../src/lib/trace.ts';

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

  it('keeps separate histories when a new runtime journal restarts its sequence', () => {
    const events = [
      ...thoughtEvents('old', 'Hearing', '旧识别', 100),
      ...thoughtEvents('new', 'sight', { path: 'frame.jpg', type: 'image' }, 200),
    ] as AnyVigiliaEvent[];

    const runs = buildVigiliaThoughtRuns(events);
    const conversation = buildVigiliaConversationEntries(events);

    expect(runs.map(run => run.id)).toEqual(['old', 'new']);
    expect(conversation).toMatchObject([
      { content: '旧识别', kind: 'asr', label: 'ASR' },
      { content: 'old-output', kind: 'model', label: 'MODEL' },
      { content: 'new-output', kind: 'model', label: 'MODEL' },
    ]);
  });
});

describe('buildVigiliaSignalSteps', () => {
  it('only inserts non-empty ASR and completed multi-frame mosaics', () => {
    const events = [
      event(1, 100, 'percept.appended', {
        content: { text: ' 识别结果 ', type: 'text' },
        perceptType: 'Hearing',
        sequence: 1,
        signal: 'Echo',
        stimulus: '直播间',
      }),
      event(2, 110, 'percept.appended', {
        content: { text: '   ', type: 'text' },
        perceptType: 'Hearing',
        sequence: 2,
        signal: 'Echo',
        stimulus: '直播间',
      }),
      event(3, 120, 'percept.appended', {
        content: { path: 'frames/raw.jpg', type: 'image' },
        perceptType: 'Sight',
        sequence: 3,
        signal: 'Photon',
        stimulus: '直播间',
      }),
      event(4, 130, 'vision.composed', {
        frameCount: 9,
        path: 'frames/composed.jpg',
        signal: 'Photon',
        stimulus: '直播间',
      }),
    ] as AnyVigiliaEvent[];

    expect(buildVigiliaSignalSteps(events)).toMatchObject([
      { lane: 'asr', output: '识别结果', startedAt: 100 },
      {
        lane: 'vision',
        output: { frameCount: 9, path: 'frames/composed.jpg' },
        startedAt: 130,
      },
    ]);
  });
});

function thoughtEvents(
  id: string,
  perceptType: string,
  content: Extract<AnyVigiliaEvent, { type: 'percept.appended' }>['data']['content'],
  time: number,
) {
  return [
    event(1, time, 'percept.appended', {
      content,
      perceptType,
      sequence: 1,
      signal: perceptType.toLocaleLowerCase() === 'sight' ? '直播画面' : 'Echo',
      stimulus: perceptType.toLocaleLowerCase() === 'sight' ? '场景' : 'Microphone',
    }),
    event(2, time + 1, 'nucleus.think.started', {
      fromSequence: 0,
      operationId: id,
      throughSequence: 1,
      trigger: 'test',
    }),
    event(3, time + 2, 'nucleus.think.completed', {
      durationMs: 1,
      inputTokens: 1,
      operationId: id,
      output: `${id}-output`,
      outputTokens: 1,
      trigger: 'test',
    }),
  ];
}

function event<TType extends AnyVigiliaEvent['type']>(
  sequence: number,
  time: number,
  type: TType,
  data: Extract<AnyVigiliaEvent, { type: TType }>['data'],
) {
  return { data, sequence, time, type, version: 1 };
}
