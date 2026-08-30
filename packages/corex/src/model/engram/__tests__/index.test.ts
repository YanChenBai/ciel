import { expect, test } from 'vite-plus/test';

import { createEngram, type Percept } from '#model';
import { definePercept } from '#model/percept/index.ts';
import { defineSignal } from '#model/signal/index.ts';

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
    recentLimit: 10,
    now: () => 10_000,
  });
  const first = createTestPercept('first', 1);
  const second = createTestPercept('second', 2);

  const entries = engram.append(first, second);

  expect(entries).toEqual([
    { sequence: 0, recordedAt: 10_000, value: first },
    { sequence: 1, recordedAt: 10_000, value: second },
  ]);
  expect(engram.all()).toEqual(entries);
  expect(engram.size).toBe(2);
  expect(engram.append()).toEqual([]);
});

test('读取时间范围和最近的 sequence 窗口', () => {
  let now = 1_000;
  const engram = createEngram({
    recentLimit: 2,
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
  expect(engram.recent().map(entry => entry.value)).toEqual([inside, atEnd]);
  expect(engram.recent({ limit: 1 }).map(entry => entry.value)).toEqual([atEnd]);
  expect(engram.recent({ through: 1 }).map(entry => entry.value)).toEqual([atStart, inside]);
  expect(engram.betweenSequences(0, 1).map(entry => entry.value)).toEqual([atStart, inside]);
});

test('按照 Percept 定义筛选条目', () => {
  const otherPerceptDefinition = definePercept({
    name: 'other-percept',
    description: 'Another percept used by Engram tests',
  });
  const engram = createEngram({ recentLimit: 10, now: () => 1_000 });
  const included = createTestPercept('included', 1);
  const temporal = { kind: 'instant', at: 2 } as const;
  const source = signalDefinition.create('excluded', temporal);
  const excluded = otherPerceptDefinition.create({
    source,
    contents: [{ type: 'text', text: 'excluded' }],
    temporal,
  });

  engram.append(included, excluded);

  expect(engram.entries(perceptDefinition).map(entry => entry.value)).toEqual([included]);
  expect(engram.entries(otherPerceptDefinition).map(entry => entry.value)).toEqual([excluded]);
});

test('游标按配置的时间窗口推进', () => {
  let now = 1_000;
  const engram = createEngram({
    recentLimit: 10,
    now: () => now,
  });
  const first = createTestPercept('first', 1);
  const second = createTestPercept('second', 2);

  engram.append(first);
  now = 1_100;
  engram.append(second);

  const cursor = engram.createCursor({ from: 1_000, windowMs: 100 });

  expect(cursor.peek().entries.map(entry => entry.value)).toEqual([first]);
  expect(cursor.position).toBe(1_000);
  expect(cursor.next().entries.map(entry => entry.value)).toEqual([first]);
  expect(cursor.position).toBe(1_100);
  expect(cursor.next().entries.map(entry => entry.value)).toEqual([second]);

  cursor.seek(1_000);
  expect(cursor.position).toBe(1_000);
});

test('consumer 只在 commit 后推进，并保留 checkout 期间的新条目', () => {
  const engram = createEngram({ recentLimit: 10, now: () => 1_000 });
  const consumer = engram.createConsumer('agent');
  const first = createTestPercept('first', 1);
  const second = createTestPercept('second', 2);

  engram.append(first);
  const checkout = consumer.checkout();
  engram.append(second);

  expect(consumer.checkout()).toBe(checkout);
  expect(checkout.entries.map(entry => entry.value)).toEqual([first]);
  consumer.commit(checkout);
  expect(consumer.position).toBe(0);
  expect(consumer.checkout().entries.map(entry => entry.value)).toEqual([second]);
});

test('清理超过保留期限的条目', () => {
  let now = 1_000;
  const engram = createEngram({
    recentLimit: 10,
    retentionMs: 200,
    now: () => now,
  });

  engram.append(createTestPercept('expired', 1));
  now = 1_200;
  engram.append(createTestPercept('boundary', 2));
  now = 1_201;

  expect(engram.prune()).toBe(1);
  expect(engram.size).toBe(1);
  expect(engram.all().map(entry => entry.value)).toEqual([createTestPercept('boundary', 2)]);

  engram.clear();
  expect(engram.all()).toEqual([]);
  expect(engram.size).toBe(0);
});

test('校验时长和时间范围', () => {
  expect(() => createEngram({ recentLimit: 0 })).toThrow(RangeError);

  const engram = createEngram({ recentLimit: 10, now: () => 1_000 });

  expect(() => engram.recent({ limit: -1 })).toThrow(RangeError);
  expect(() => engram.recent({ through: -2 })).toThrow(RangeError);
  expect(() => engram.between(2, 1)).toThrow(RangeError);
  expect(() => engram.betweenSequences(2, 1)).toThrow(RangeError);
  expect(() => engram.createCursor({ windowMs: Number.POSITIVE_INFINITY })).toThrow(RangeError);
});
