import type {
  EngramEntryRecord,
  JsonValue,
  OperationRecord,
  SerializedValue,
} from '@ciels/devtool-protocol';
import { describe, expect, it } from 'vite-plus/test';

import { buildConversationItems } from '../src/components/conversation/items.ts';

describe('buildConversationItems', () => {
  it('只展示 ASR、Thinking 和已发送的模拟或真实弹幕', () => {
    const entries = [
      percept(1, 'Hearing', { text: '主播刚才唱了一首歌', type: 'text' }),
      percept(2, 'Sight', {
        data: '[Buffer 1753636 bytes]',
        mimeType: 'image/jpeg',
        type: 'image',
      }),
    ];
    const operations = [
      operation('thinking', 'ciel.model.generate', {
        output: serialized({
          content: [{ thinking: '这时适合发一条简短弹幕', type: 'thinking' }],
          role: 'assistant',
        }),
      }),
      operation('simulated', 'ciel.tool.execute', {
        attributes: { toolName: 'send_danmaku' },
        input: serialized(['call-1', { action: 'send', content: '唱得真好', reason: '演唱结束' }]),
        output: serialized({ details: { content: '唱得真好', sent: false, simulated: true } }),
      }),
      operation('real', 'ciel.tool.execute', {
        attributes: { toolName: 'send_danmaku' },
        input: serialized(['call-2', { action: 'send', content: '好听！', reason: '自然互动' }]),
        output: serialized({ details: { content: '好听！', sent: true, simulated: false } }),
      }),
      operation('defer', 'ciel.tool.execute', {
        attributes: { toolName: 'send_danmaku' },
        input: serialized(['call-3', { action: 'defer', content: '', reason: '没有互动机会' }]),
        output: serialized({ details: { sent: false } }),
      }),
    ];

    expect(buildConversationItems(entries, operations)).toMatchObject([
      { kind: 'asr', label: 'ASR', text: '主播刚才唱了一首歌' },
      { kind: 'thinking', label: 'THINKING', text: '这时适合发一条简短弹幕' },
      { kind: 'danmaku-simulated', label: '模拟弹幕', text: '唱得真好' },
      { kind: 'danmaku-real', label: '真实弹幕', text: '好听！' },
    ]);
  });
});

function percept(sequence: number, name: string, contents: JsonValue): EngramEntryRecord {
  const temporal = { kind: 'instant' as const, at: sequence * 100 };
  return {
    sequence,
    recordedAt: sequence * 100,
    percept: {
      definition: { id: name.toLocaleLowerCase(), name, type: 'percept' },
      source: {
        definition: { id: 'live', name: 'Live', type: 'signal' },
        payload: serialized(null),
        temporal,
      },
      temporal,
      contents: serialized(contents),
    },
  };
}

function operation(id: string, name: string, overrides: Partial<OperationRecord>): OperationRecord {
  const startedAt =
    ({ thinking: 300, simulated: 400, real: 500, defer: 600 } as Record<string, number>)[id] ??
    1_000;
  return {
    id,
    label: name === 'ciel.tool.execute' ? 'Tool Execute' : 'Model Generate',
    name,
    tag: name === 'ciel.tool.execute' ? 'TOOL' : 'AGENT',
    startedAt,
    completedAt: startedAt + 100,
    durationMs: 100,
    status: 'completed',
    attributes: {},
    input: serialized(null),
    output: serialized(null),
    ...overrides,
  };
}

function serialized(value: JsonValue): SerializedValue {
  return { type: 'serialized', encoding: 'json', data: JSON.stringify(value) };
}
