import type { OperationRecord } from '@ciels/devtool-protocol';
import { expect, test } from 'vite-plus/test';

import {
  defaultTrace,
  type DevtoolTraceEntry,
  resolveTraceEntry,
  traceLanes,
} from '../src/components/trace/model.ts';

const omitted = { type: 'omitted', reason: 'capture-disabled' } as const;

function operation(
  name: string,
  label: string,
  tag: string,
  attributes: OperationRecord['attributes'] = {},
): OperationRecord {
  return {
    id: name,
    label,
    name,
    tag,
    startedAt: 1,
    status: 'completed',
    attributes,
    input: omitted,
    output: omitted,
  };
}

test('默认 trace 仅显示声明的 Corex operation 并直接使用固定 label/tag', () => {
  expect(
    resolveTraceEntry(
      operation('ciel.cue.submit', 'Cue Submit', 'CUE', {
        cueDefinitionName: 'speech-ended',
      }),
      defaultTrace,
    ),
  ).toMatchObject({
    label: 'Cue Submit',
    lane: { id: 'cue', label: 'CUE' },
    type: 'point',
  });
  expect(
    resolveTraceEntry(operation('ciel.sensu.output', 'Sensu Output', 'SENSU'), defaultTrace),
  ).toBeUndefined();
});

test('业务 trace 通过一个列表扩展可见 operation 和颜色', () => {
  const trace: readonly DevtoolTraceEntry[] = [
    ...defaultTrace,
    {
      match: candidate => candidate.name.startsWith('watch-blive.room.'),
      color: 'var(--trace-vision)',
    },
  ];
  const room = operation('watch-blive.room.open', 'Room Open', 'ROOM');

  expect(resolveTraceEntry(room, trace)).toMatchObject({
    color: 'var(--trace-vision)',
    label: 'Room Open',
    lane: { id: 'room', label: 'ROOM' },
  });
  expect(
    traceLanes([
      operation('ciel.cue.submit', 'Cue Submit', 'CUE'),
      operation('ciel.agent.run', 'Agent Run', 'AGENT'),
      operation('ciel.model.generate', 'Model Generate', 'AGENT'),
      operation('ciel.agent.prompt', 'Agent Prompt', 'CONTEXT'),
      operation('ciel.tool.execute', 'Tool Execute', 'TOOL'),
      room,
    ]).map(lane => lane.id),
  ).toEqual(['cue', 'agent', 'context', 'tool', 'room']);
});
