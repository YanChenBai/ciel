import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterEach, describe, expect, it } from 'vite-plus/test';

import { PGliteMemoryStore } from '../src/store/pglite.ts';
import type { MemoryScope } from '../src/types.ts';

const stores: PGliteMemoryStore[] = [];
const temporaryDirectories: string[] = [];
const room: MemoryScope = { id: 'room:1', label: '一号直播间' };
const otherRoom: MemoryScope = { id: 'room:2', label: '二号直播间' };

async function createStore(): Promise<PGliteMemoryStore> {
  const store = new PGliteMemoryStore({ path: ':memory:' });
  stores.push(store);
  await store.start();
  return store;
}

afterEach(async () => {
  await Promise.all(stores.splice(0).map(store => store.close()));
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map(directory => rm(directory, { recursive: true, force: true })),
  );
});

describe('PGliteMemoryStore', () => {
  it('原子写入每日记忆、向量并执行幂等去重', async () => {
    const store = await createStore();
    const input = {
      namespaceId: 'ciel:1',
      scope: room,
      date: '2026-08-30',
      content: 'The host introduced a black cat.',
      embedding: [1, 0, 0],
      occurredAt: 1_777_777_700_000,
      createdAt: 1_777_777_701_000,
      idempotencyKey: 'event:1',
    } as const;

    const first = await store.appendDaily(input);
    const second = await store.appendDaily({ ...input, content: 'Duplicate candidate.' });

    expect(second).toEqual(first);
    await expect(store.listDaily('ciel:1', room)).resolves.toEqual([first]);
    await expect(store.listDaily('ciel:2', room)).resolves.toEqual([]);
  });

  it('隔离 Scope，并保留跨 Scope 搜索结果的来源', async () => {
    const store = await createStore();
    await store.appendDaily({
      namespaceId: 'ciel:1',
      scope: room,
      date: '2026-08-29',
      content: '主播介绍了一只黑猫。',
      embedding: [1, 0, 0],
      occurredAt: 100,
      createdAt: 100,
    });
    await store.appendDaily({
      namespaceId: 'ciel:1',
      scope: otherRoom,
      date: '2026-08-30',
      content: 'The host talked about a white dog.',
      embedding: [0, 1, 0],
      occurredAt: 200,
      createdAt: 200,
    });

    const current = await store.search({
      namespaceId: 'ciel:1',
      currentScope: room,
      scope: 'current',
      query: '黑猫',
    });
    const all = await store.search({ namespaceId: 'ciel:1', scope: 'all' });

    expect(current.entries).toHaveLength(1);
    expect(current.entries[0]?.scope).toEqual(room);
    expect(all.entries.map(entry => entry.scope)).toEqual([otherRoom, room]);
  });

  it('没有 embedding 时仍提交正文并支持确定性搜索', async () => {
    const store = await createStore();
    const daily = await store.appendDaily({
      namespaceId: 'ciel:text-only',
      scope: room,
      date: '2026-08-30',
      content: '主播傲慢的小肉包喜欢黑猫。',
      occurredAt: 100,
      createdAt: 100,
    });
    const revision = await store.commitLongTerm({
      namespaceId: 'ciel:text-only',
      scope: room,
      content: '傲慢的小肉包是一位主播。',
      basedOnDates: ['2026-08-30'],
      createdAt: 200,
    });

    const searched = await store.search({
      namespaceId: 'ciel:text-only',
      currentScope: room,
      scope: 'current',
      query: '傲慢的小肉包',
    });

    expect(searched.entries.map(entry => entry.id)).toEqual([revision.id, daily.id]);
    await expect(store.latestLongTerm('ciel:text-only', room)).resolves.toEqual(revision);
  });

  it('保存长期 revision，并通过 pgvector 召回最相关记录', async () => {
    const store = await createStore();
    await store.appendDaily({
      namespaceId: 'ciel:1',
      scope: room,
      date: '2026-08-29',
      content: 'The host introduced a black cat.',
      embedding: [1, 0, 0],
      occurredAt: 100,
      createdAt: 100,
    });
    const revision = await store.commitLongTerm({
      namespaceId: 'ciel:1',
      scope: room,
      content: 'The host keeps a black cat.',
      embedding: [0.9, 0.1, 0],
      basedOnDates: ['2026-08-29'],
      createdAt: 200,
    });

    expect(revision.revision).toBe(1);
    await expect(store.latestLongTerm('ciel:1', room)).resolves.toEqual(revision);

    const recalled = await store.recall({
      namespaceId: 'ciel:1',
      currentScope: room,
      scope: 'current',
      embedding: [1, 0, 0],
      limit: 2,
    });
    expect(recalled).toHaveLength(2);
    expect(recalled[0]?.content).toBe('The host introduced a black cat.');
    expect(recalled.every(entry => entry.scope !== 'global')).toBe(true);
  });

  it('列出未结算日期并支持重复关闭', async () => {
    const store = await createStore();
    await store.appendDaily({
      namespaceId: 'ciel:1',
      scope: 'global',
      date: '2026-08-29',
      content: 'The user prefers concise replies.',
      embedding: [0, 0, 1],
      occurredAt: 100,
      createdAt: 100,
    });

    await expect(store.listPendingDates('ciel:1', '2026-08-30')).resolves.toEqual([
      { date: '2026-08-29', scope: 'global' },
    ]);
    await store.markDateConsolidated('ciel:1', 'global', '2026-08-29');
    await expect(store.listPendingDates('ciel:1', '2026-08-30')).resolves.toEqual([]);

    await store.close();
    await expect(store.close()).resolves.toBeUndefined();
  });

  it('从同一个 PGlite 数据目录恢复已提交记忆', async () => {
    const directory = await mkdtemp(path.join(tmpdir(), 'ciel-pglite-memory-'));
    temporaryDirectories.push(directory);
    const first = new PGliteMemoryStore({ path: directory });
    stores.push(first);
    await first.start();
    await first.appendDaily({
      namespaceId: 'ciel:persistent',
      scope: room,
      date: '2026-08-30',
      content: 'Persistent memory survives a restart.',
      embedding: [1, 0, 0],
      occurredAt: 100,
      createdAt: 100,
    });
    await first.close();

    const second = new PGliteMemoryStore({ path: directory });
    stores.push(second);
    await second.start();

    const restored = await second.listDaily('ciel:persistent', room);
    expect(restored).toHaveLength(1);
    expect(restored[0]?.content).toBe('Persistent memory survives a restart.');
  });
});
