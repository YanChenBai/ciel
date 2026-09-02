import type { EngramEntryRecord, OperationRecord } from '@ciels/devtool-protocol';

import { deserializeValue, valueText } from '@/session/value.ts';

import type { ConversationItem } from './types.ts';

export function buildConversationItems(
  entries: readonly EngramEntryRecord[],
  operations: readonly OperationRecord[],
): readonly ConversationItem[] {
  return [
    ...entries.flatMap(asrItem),
    ...operations.flatMap(operation =>
      [thinkingItem(operation), danmakuItem(operation)].filter(hasItem),
    ),
  ].sort((left, right) => (left.time ?? 0) - (right.time ?? 0));
}

function asrItem(entry: EngramEntryRecord): readonly ConversationItem[] {
  if (!entry.percept.definition.name.toLocaleLowerCase().includes('hearing')) return [];
  const text = valueText(entry.percept.contents).trim();
  if (!text) return [];
  return [
    {
      id: `asr-${entry.sequence}`,
      kind: 'asr',
      label: 'ASR',
      metadata: `语音识别 #${entry.sequence}`,
      text,
      time: entry.recordedAt,
    },
  ];
}

function thinkingItem(operation: OperationRecord): ConversationItem | undefined {
  if (operation.name !== 'ciel.model.generate' || operation.status !== 'completed') return;
  const thinking = findThinking(deserializeValue(operation.output));
  if (!thinking) return;
  return {
    id: `thinking-${operation.id}`,
    kind: 'thinking',
    label: 'THINKING',
    metadata: 'Agent 思考过程',
    text: thinking,
    time: operation.completedAt ?? operation.startedAt,
  };
}

function danmakuItem(operation: OperationRecord): ConversationItem | undefined {
  if (
    operation.name !== 'ciel.tool.execute' ||
    operation.attributes.toolName !== 'send_danmaku' ||
    operation.status !== 'completed'
  ) {
    return;
  }
  const input = findRecord(deserializeValue(operation.input), candidate => {
    return (
      candidate.action === 'send' &&
      typeof candidate.content === 'string' &&
      candidate.content.trim().length > 0
    );
  });
  if (!input || typeof input.content !== 'string') return;
  const output = deserializeValue(operation.output);
  const simulated = findBoolean(output, 'simulated');
  const sent = findBoolean(output, 'sent');
  if (!simulated && !sent) return;
  return {
    id: `danmaku-${operation.id}`,
    kind: simulated ? 'danmaku-simulated' : 'danmaku-real',
    label: simulated ? '模拟弹幕' : '真实弹幕',
    metadata: simulated ? 'Agent 弹幕 · 模拟发送' : 'Agent 弹幕 · 已发送',
    text: input.content.trim(),
    time: operation.completedAt ?? operation.startedAt,
  };
}

function findThinking(value: unknown, depth = 0): string | undefined {
  if (!value || typeof value !== 'object' || depth > 5) return;
  const record = value as Record<string, unknown>;
  if (record.type === 'thinking' && typeof record.thinking === 'string') {
    return record.thinking.trim() || undefined;
  }
  for (const nested of Object.values(record)) {
    const found = findThinking(nested, depth + 1);
    if (found) return found;
  }
}

function findRecord(
  value: unknown,
  predicate: (value: Readonly<Record<string, unknown>>) => boolean,
  depth = 0,
): Readonly<Record<string, unknown>> | undefined {
  if (!value || typeof value !== 'object' || depth > 5) return;
  const record = value as Record<string, unknown>;
  if (!Array.isArray(value) && predicate(record)) return record;
  for (const nested of Object.values(record)) {
    const found = findRecord(nested, predicate, depth + 1);
    if (found) return found;
  }
}

function findBoolean(value: unknown, key: string, depth = 0): boolean | undefined {
  if (!value || typeof value !== 'object' || depth > 5) return;
  const record = value as Record<string, unknown>;
  if (typeof record[key] === 'boolean') return record[key];
  for (const nested of Object.values(record)) {
    const found = findBoolean(nested, key, depth + 1);
    if (found !== undefined) return found;
  }
}

function hasItem(value: ConversationItem | undefined): value is ConversationItem {
  return value !== undefined;
}
