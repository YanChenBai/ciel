import type { AnyVigiliaEvent } from '@ciels/core';
import { describe, expect, it } from 'vite-plus/test';

import { resolveAssetUrl } from '../src/lib/assets.ts';
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
        endAt: 85,
        perceptType: 'Hearing',
        sequence: 1,
        signal: 'Echo',
        startAt: 20,
        stimulus: 'Microphone',
      }),
      event(1, 100, 'nucleus.think.started', {
        fromSequence: 0,
        name: 'select-live-room',
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
        name: 'select-live-room',
        operationId: 'think-1',
        output: 'done',
        trigger: 'manual',
      }),
    ] as AnyVigiliaEvent[];

    const runs = buildVigiliaThoughtRuns(events);

    expect(runs).toHaveLength(1);
    expect(runs[0]).toMatchObject({
      id: 'think-1',
      status: 'completed',
      trigger: 'select-live-room',
    });
    expect(runs[0]?.steps[0]).toMatchObject({
      label: 'Select Live Room',
      name: 'select-live-room',
    });
    expect(runs[0]?.inputPercepts).toEqual([
      expect.objectContaining({ content: '你好，介绍一下你自己', perceptType: 'Hearing' }),
    ]);
    expect(runs[0]?.output).toBe('done');
    expect(runs[0]?.steps).toHaveLength(3);
    expect(runs[0]?.steps[1]).toMatchObject({
      durationMs: 20,
      label: 'Read Recent',
      lane: 'memory',
      name: 'read-recent',
      output: { entries: 2 },
      status: 'completed',
    });
    expect(runs[0]?.steps[2]).toMatchObject({
      label: 'Search Weather',
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
      {
        content: { path: 'mosaics/new.jpg', type: 'image' },
        kind: 'visual',
        label: 'VISION',
        metadata: '9-Frame Mosaic · 场景 / 直播画面',
      },
      { content: 'new-output', kind: 'model', label: 'MODEL' },
    ]);
  });

  it('adds agent send_danmaku calls to the conversation in chronological order', () => {
    const events = [
      event(1, 100, 'nucleus.think.started', {
        fromSequence: 0,
        operationId: 'think-1',
        throughSequence: 0,
        trigger: 'manual',
      }),
      event(2, 110, 'operation.started', {
        category: 'tool',
        detail: {
          input: { action: 'send', content: '今天唱得真好', reason: '演唱结束' },
          toolCallId: 'call-1',
          toolName: 'send_danmaku',
        },
        name: 'send-danmaku',
        operationId: 'tool-1',
        parentOperationId: 'think-1',
      }),
      event(3, 120, 'operation.completed', {
        category: 'tool',
        detail: { output: { value: { sent: true, simulated: false } } },
        durationMs: 10,
        name: 'send-danmaku',
        operationId: 'tool-1',
        parentOperationId: 'think-1',
      }),
      event(4, 130, 'nucleus.think.completed', {
        durationMs: 30,
        operationId: 'think-1',
        output: { action: 'stay' },
        trigger: 'manual',
      }),
    ] as AnyVigiliaEvent[];

    expect(buildVigiliaConversationEntries(events)).toMatchObject([
      {
        content: '今天唱得真好',
        kind: 'danmaku',
        label: 'DANMAKU',
        metadata: 'Agent 弹幕 · 已发送',
        time: 120,
      },
      { content: { action: 'stay' }, kind: 'model' },
    ]);
  });

  it('projects each ASR percept once and shares its identity and media time with the trace', () => {
    const events = [
      event(1, 1_000, 'percept.appended', {
        content: { text: '同一段识别', type: 'text' },
        endAt: 950,
        perceptType: 'Hearing',
        sequence: 7,
        signal: '直播音频',
        startAt: 800,
        stimulus: '场景',
      }),
      event(2, 1_010, 'nucleus.think.started', {
        fromSequence: 0,
        operationId: 'think-1',
        throughSequence: 7,
        trigger: 'interval',
      }),
      event(3, 1_020, 'nucleus.think.completed', {
        durationMs: 10,
        operationId: 'think-1',
        output: 'first',
        trigger: 'interval',
      }),
      event(4, 1_030, 'nucleus.think.started', {
        fromSequence: 0,
        name: 'requested-think',
        operationId: 'think-2',
        throughSequence: 7,
        trigger: 'requested',
      }),
      event(5, 1_040, 'nucleus.think.completed', {
        durationMs: 10,
        name: 'requested-think',
        operationId: 'think-2',
        output: 'second',
        trigger: 'requested',
      }),
    ] as AnyVigiliaEvent[];

    const conversationAsr = buildVigiliaConversationEntries(events).filter(
      entry => entry.kind === 'asr',
    );
    const traceAsr = buildVigiliaSignalSteps(events).filter(step => step.lane === 'asr');

    expect(conversationAsr).toEqual([
      expect.objectContaining({
        content: { text: '同一段识别', type: 'text' },
        id: 'asr:0:7',
        metadata: 'Hearing #7 · 场景 / 直播音频',
        time: 800,
      }),
    ]);
    expect(traceAsr).toEqual([
      expect.objectContaining({ id: 'asr:0:7', output: '同一段识别', startedAt: 800 }),
    ]);
  });
});

describe('buildVigiliaSignalSteps', () => {
  it('only inserts non-empty ASR and completed multi-frame mosaics', () => {
    const events = [
      event(1, 100, 'percept.appended', {
        content: { text: ' 识别结果 ', type: 'text' },
        endAt: 95,
        perceptType: 'Hearing',
        sequence: 1,
        signal: 'Echo',
        startAt: 80,
        stimulus: '直播间',
      }),
      event(2, 110, 'percept.appended', {
        content: { text: '   ', type: 'text' },
        endAt: 108,
        perceptType: 'Hearing',
        sequence: 2,
        signal: 'Echo',
        startAt: 101,
        stimulus: '直播间',
      }),
      event(3, 120, 'percept.appended', {
        content: { path: 'frames/raw.jpg', type: 'image' },
        endAt: 115,
        perceptType: 'Sight',
        sequence: 3,
        signal: 'Photon',
        startAt: 115,
        stimulus: '直播间',
      }),
      event(4, 125, 'operation.started', {
        category: 'sensory',
        name: 'image-ingest',
        operationId: 'image-ingest-1',
      }),
      event(5, 126, 'operation.completed', {
        category: 'sensory',
        durationMs: 1,
        name: 'image-ingest',
        operationId: 'image-ingest-1',
      }),
      event(6, 140, 'vision.composed', {
        frameCount: 9,
        path: 'frames/composed.jpg',
        signal: 'Photon',
        stimulus: '直播间',
      }),
    ] as AnyVigiliaEvent[];

    expect(buildVigiliaSignalSteps(events)).toMatchObject([
      {
        completedAt: 95,
        durationMs: 15,
        label: 'ASR Transcription',
        lane: 'asr',
        name: 'asr-transcription',
        output: '识别结果',
        startedAt: 80,
      },
      {
        label: '9-Frame Mosaic',
        lane: 'vision',
        name: 'vision-mosaic',
        output: { frameCount: 9, path: 'frames/composed.jpg' },
        startedAt: 140,
        completedAt: 140,
        durationMs: 0,
      },
    ]);
  });
});

describe('resolveAssetUrl', () => {
  it('turns captured relative paths into encoded API URLs', () => {
    expect(resolveAssetUrl('http://127.0.0.1:3210/assets/', { path: 'vision/画面 1.jpg' })).toBe(
      'http://127.0.0.1:3210/assets/vision/%E7%94%BB%E9%9D%A2%201.jpg',
    );
    expect(
      resolveAssetUrl('http://127.0.0.1:3210/assets/', { path: '../secret.jpg' }),
    ).toBeUndefined();
    expect(
      resolveAssetUrl('http://127.0.0.1:3210/assets/', { path: 'C:/data/secret.jpg' }),
    ).toBeUndefined();
  });
});

describe('model operation names', () => {
  it('describes the purpose of initial and post-tool model calls', () => {
    const events = [
      event(1, 100, 'nucleus.think.started', {
        fromSequence: 0,
        operationId: 'think-1',
        throughSequence: 0,
        trigger: 'manual',
      }),
      event(2, 110, 'operation.started', {
        category: 'model',
        name: 'choose-response-or-tools',
        operationId: 'model-step-0',
        parentOperationId: 'think-1',
      }),
      event(3, 120, 'operation.completed', {
        category: 'model',
        durationMs: 10,
        name: 'choose-response-or-tools',
        operationId: 'model-step-0',
        parentOperationId: 'think-1',
      }),
      event(4, 130, 'operation.started', {
        category: 'model',
        name: 'continue-with-tool-results',
        operationId: 'model-step-1',
        parentOperationId: 'think-1',
      }),
      event(5, 140, 'operation.completed', {
        category: 'model',
        durationMs: 10,
        name: 'continue-with-tool-results',
        operationId: 'model-step-1',
        parentOperationId: 'think-1',
      }),
    ] as AnyVigiliaEvent[];

    expect(buildVigiliaThoughtRuns(events)[0]?.steps.map(step => [step.name, step.label])).toEqual([
      ['think', 'Think'],
      ['choose-response-or-tools', 'Choose Response Or Tools'],
      ['continue-with-tool-results', 'Continue With Tool Results'],
    ]);
  });
});

function thoughtEvents(
  id: string,
  perceptType: string,
  content: Extract<AnyVigiliaEvent, { type: 'percept.appended' }>['data']['content'],
  time: number,
) {
  const sight = perceptType.toLocaleLowerCase() === 'sight';
  return [
    event(1, time, 'percept.appended', {
      content,
      endAt: time - 1,
      perceptType,
      sequence: 1,
      signal: sight ? '直播画面' : 'Echo',
      startAt: time - 2,
      stimulus: sight ? '场景' : 'Microphone',
    }),
    event(2, time + 1, 'nucleus.think.started', {
      fromSequence: 0,
      operationId: id,
      throughSequence: 1,
      trigger: 'test',
    }),
    ...(sight
      ? [
          event(3, time + 2, 'vision.composed', {
            frameCount: 9,
            path: `mosaics/${id}.jpg`,
            signal: '直播画面',
            stimulus: '场景',
          }),
        ]
      : []),
    event(sight ? 4 : 3, time + 3, 'nucleus.think.completed', {
      durationMs: 2,
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
