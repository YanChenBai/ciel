import { expect, test } from 'vite-plus/test';

import { createEngram, definePercept, defineSignal, type Percept } from '../src/index.ts';

const signalDefinition = defineSignal<string>({
  name: 'test-signal',
  description: 'A signal used by Engram tests',
});
const perceptDefinition = definePercept({
  name: 'test-percept',
  description: 'A percept used by Engram tests',
});

function createTestPercept(value: string, at: number): Percept {
  const temporal = { kind: 'instant', at } as const;
  const source = signalDefinition.create(value, temporal);

  return perceptDefinition.create({
    source,
    contents: [{ type: 'text', text: value }],
    temporal,
  });
}

test('将多个 Percept 作为同一时间戳批次追加', () => {
  const engram = createEngram({
    windowMs: 1_000,
    now: () => 10_000,
  });
  const first = createTestPercept('first', 1);
  const second = createTestPercept('second', 2);

  const entries = engram.append(first, second);

  expect(entries).toEqual([
    { sequence: 0, recordedAt: 10_000, value: first },
    { sequence: 1, recordedAt: 10_000, value: second },
  ]);
  expect(engram.size).toBe(2);
  expect(engram.append()).toEqual([]);
});

test('读取左闭右开的时间窗口', () => {
  let now = 1_000;
  const engram = createEngram({
    windowMs: 100,
    now: () => now,
  });
  const atStart = createTestPercept('at-start', 1);
  const inside = createTestPercept('inside', 2);
  const atEnd = createTestPercept('at-end', 3);

  engram.append(atStart);
  now = 1_050;
  engram.append(inside);
  now = 1_100;
  engram.append(atEnd);

  expect(engram.between(1_000, 1_100).map(entry => entry.value)).toEqual([atStart, inside]);
  expect(engram.recent().map(entry => entry.value)).toEqual([atStart, inside, atEnd]);
  expect(engram.recent(50).map(entry => entry.value)).toEqual([inside, atEnd]);
});

test('游标按配置的时间窗口推进', () => {
  let now = 1_000;
  const engram = createEngram({
    windowMs: 100,
    now: () => now,
  });
  const first = createTestPercept('first', 1);
  const second = createTestPercept('second', 2);

  engram.append(first);
  now = 1_100;
  engram.append(second);

  const cursor = engram.createCursor({ from: 1_000 });

  expect(cursor.peek().entries.map(entry => entry.value)).toEqual([first]);
  expect(cursor.position).toBe(1_000);
  expect(cursor.next().entries.map(entry => entry.value)).toEqual([first]);
  expect(cursor.position).toBe(1_100);
  expect(cursor.next().entries.map(entry => entry.value)).toEqual([second]);

  cursor.seek(1_000);
  expect(cursor.position).toBe(1_000);
});

test('清理超过保留期限的条目', () => {
  let now = 1_000;
  const engram = createEngram({
    windowMs: 100,
    retentionMs: 200,
    now: () => now,
  });

  engram.append(createTestPercept('expired', 1));
  now = 1_200;
  engram.append(createTestPercept('boundary', 2));
  now = 1_201;

  expect(engram.prune()).toBe(1);
  expect(engram.size).toBe(1);

  engram.clear();
  expect(engram.size).toBe(0);
});

test('校验时长和时间范围', () => {
  expect(() => createEngram({ windowMs: 0 })).toThrow(RangeError);

  const engram = createEngram({ windowMs: 100, now: () => 1_000 });

  expect(() => engram.recent(-1)).toThrow(RangeError);
  expect(() => engram.between(2, 1)).toThrow(RangeError);
  expect(() => engram.createCursor({ windowMs: Number.POSITIVE_INFINITY })).toThrow(RangeError);
});
