// @env node

import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { MockEmbeddingModelV3, MockLanguageModelV3 } from 'ai/test';
import { afterEach, describe, expect, it } from 'vite-plus/test';

import type { VigiliaObservation } from '#vigilia';

import { Memory } from './memory.ts';
import { createMemoryResourceId } from './resource-id.ts';

const temporaryDirectories: string[] = [];
const memories: Memory[] = [];

function createEmbedder(): MockEmbeddingModelV3 {
  return new MockEmbeddingModelV3({
    maxEmbeddingsPerCall: Number.POSITIVE_INFINITY,
    supportsParallelCalls: true,
    doEmbed: async ({ values }) => ({
      embeddings: values.map(value => (value.includes('猫') ? [1, 0] : [0, 1])),
      usage: {
        tokens: values.length,
      },
      warnings: [],
    }),
  });
}

function createModel(): MockLanguageModelV3 {
  return new MockLanguageModelV3({
    doGenerate: {
      content: [{ type: 'text', text: '经历摘要' }],
      finishReason: { unified: 'stop', raw: undefined },
      usage: {
        inputTokens: { total: 1, noCache: 1, cacheRead: 0, cacheWrite: 0 },
        outputTokens: { total: 1, text: 1, reasoning: 0 },
      },
      warnings: [],
    },
  });
}

async function createMemory(recentDays = 2, persistent = false): Promise<Memory> {
  let databasePath = ':memory:';
  if (persistent) {
    const root = await mkdtemp(path.join(tmpdir(), 'ciel-memory-'));
    temporaryDirectories.push(root);
    databasePath = path.join(root, 'memory.db');
  }
  const memory = new Memory({
    path: databasePath,
    embedder: createEmbedder(),
    model: createModel(),
    recentDays,
    resourceId: createMemoryResourceId('test', 'memory'),
  });
  memories.push(memory);
  return memory;
}

async function createSharedMemory(resourceId: string, databasePath: string): Promise<Memory> {
  const memory = new Memory({
    path: databasePath,
    embedder: createEmbedder(),
    model: createModel(),
    resourceId,
  });
  memories.push(memory);
  return memory;
}

afterEach(async () => {
  await Promise.all(memories.splice(0).map(memory => memory.close()));
  await Promise.all(temporaryDirectories.splice(0).map(removeTemporaryDirectory));
});

async function removeTemporaryDirectory(directory: string): Promise<void> {
  try {
    await rm(directory, {
      recursive: true,
      maxRetries: 5,
      retryDelay: 50,
    });
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (process.platform !== 'win32' || code !== 'EBUSY') {
      throw error;
    }
    // libSQL 在 Windows 上可能延迟到 worker 退出才释放 WAL 文件。
  }
}

describe('Memory', () => {
  it('在实际存取位置产生 Memory operation', async () => {
    const memory = await createMemory();
    const observations: VigiliaObservation[] = [];
    memory.observations.subscribe(observation => observations.push(observation));

    await memory.updateLongTerm('需要记住的内容');
    await memory.readLongTerm();

    const names = observations.flatMap(observation => {
      if (observation.type !== 'operation.started') return [];
      return [observation.data.name];
    });
    expect(names).toEqual(['update-long-term', 'read-long-term']);
  });
  it('整体更新全局工作记忆', async () => {
    const memory = await createMemory();
    await memory.updateLongTerm('用户喜欢简洁回答。');
    await memory.updateLongTerm('用户喜欢简洁、准确的回答。');

    expect(await memory.readLongTerm()).toBe('用户喜欢简洁、准确的回答。');
  });

  it('按日期追加经历并只读取最近文件', async () => {
    const memory = await createMemory(2);
    await memory.appendEpisode('第一天', new Date(2026, 7, 10, 10));
    await memory.appendEpisode('第二天', new Date(2026, 7, 11, 11));
    await memory.appendEpisode('同一天的另一件事', new Date(2026, 7, 11, 12));
    await memory.appendEpisode('第三天', new Date(2026, 7, 12, 13));

    const recent = await memory.readRecent();
    expect(recent).not.toContain('第一天');
    expect(recent).toContain('# 2026-08-11');
    expect(recent).toContain('同一天的另一件事');
    expect(recent).toContain('# 2026-08-12');
  });

  it('跨日期语义搜索历史经历', async () => {
    const memory = await createMemory(2, true);
    await memory.appendEpisode('夏尔收养了一只黑猫。', new Date(2026, 6, 1, 10));
    await memory.appendEpisode('夏尔完成了书房整理。', new Date(2026, 7, 12, 10));

    const recalled = await memory.recall('那只猫是什么时候来的？', { limit: 1 });

    expect(recalled).toHaveLength(1);
    expect(recalled[0]?.content).toContain('黑猫');
  });

  it('隔离场景长期记忆，同时注入全局记忆', async () => {
    const memory = await createMemory();
    const firstRoom = { id: 'room:100', label: '直播间 100（甲主播）' };
    const secondRoom = { id: 'room:200', label: '直播间 200（乙主播）' };

    await memory.updateLongTerm('用户偏好简洁互动。');
    await memory.updateLongTerm('甲主播喜欢聊猫。', { scope: firstRoom });
    await memory.updateLongTerm('乙主播喜欢聊狗。', { scope: secondRoom });

    const first = await memory.readLongTerm({ scope: firstRoom });
    expect(first).toContain('用户偏好简洁互动。');
    expect(first).toContain('甲主播喜欢聊猫。');
    expect(first).not.toContain('乙主播喜欢聊狗。');
  });

  it('按场景读取最近经历，并允许带来源地跨场景召回', async () => {
    const memory = await createMemory(2, true);
    const firstRoom = { id: 'room:100', label: '直播间 100（甲主播）' };
    const secondRoom = { id: 'room:200', label: '直播间 200（乙主播）' };
    const time = new Date(2026, 7, 14, 10);
    await memory.appendEpisode('甲主播回应了关于黑猫的弹幕。', time, undefined, {
      scope: firstRoom,
    });
    await memory.appendEpisode('乙主播回应了关于白狗的弹幕。', time, undefined, {
      scope: secondRoom,
    });
    await memory.appendEpisode('形成了先观察再互动的全局经验。', time);

    const recent = await memory.readRecent({ scope: firstRoom });
    expect(recent).toContain('记忆来源：直播间 100（甲主播）');
    expect(recent).toContain('黑猫');
    expect(recent).not.toContain('白狗');

    const current = await memory.recall('主播和猫的互动', {
      limit: 5,
      range: 'current',
      scope: firstRoom,
    });
    expect(current).toHaveLength(1);
    expect(current[0]?.scope).toEqual(firstRoom);
    expect(current[0]?.content).toContain('黑猫');

    const all = await memory.recall('主播和狗的互动', { limit: 5, range: 'all' });
    expect(all).toContainEqual(
      expect.objectContaining({
        content: expect.stringContaining('白狗'),
        scope: secondRoom,
      }),
    );

    const global = await memory.recall('先观察再互动', { limit: 5, range: 'global' });
    expect(global).toHaveLength(1);
    expect(global[0]?.scope).toEqual({ id: 'global', label: '全局经历' });
    expect(global[0]?.content).toContain('全局经验');
  });

  it('使用 resourceId 隔离同一数据库中的长期记忆、每日经历和语义召回', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'ciel-memory-'));
    temporaryDirectories.push(root);
    const databasePath = path.join(root, 'memory.db');
    const first = await createSharedMemory(
      createMemoryResourceId('blive', 'room', 100),
      databasePath,
    );
    const second = await createSharedMemory(
      createMemoryResourceId('blive', 'room', 200),
      databasePath,
    );

    await first.updateLongTerm('一号直播间喜欢简洁回答。');
    await second.updateLongTerm('二号直播间喜欢详细回答。');
    // 两个资源刻意复用幂等键，验证全局 message ID 仍不会互相覆盖。
    await first.appendEpisode('一号直播间的每日经历。', new Date(2026, 7, 14, 10), 'episode:1');
    await second.appendEpisode('二号直播间的每日经历。', new Date(2026, 7, 14, 11), 'episode:1');
    await first.appendEpisode('一号直播间收养了一只黑猫。', new Date(2026, 7, 14, 12));
    await second.appendEpisode('二号直播间养了一只白狗。', new Date(2026, 7, 14, 13));

    expect(await first.readLongTerm()).toBe('一号直播间喜欢简洁回答。');
    expect(await second.readLongTerm()).toBe('二号直播间喜欢详细回答。');
    expect(await first.readRecent()).toContain('一号直播间的每日经历。');
    expect(await first.readRecent()).not.toContain('二号直播间的每日经历。');
    expect(await second.readRecent()).toContain('二号直播间的每日经历。');
    expect((await first.recall('那只猫怎么样了？', { limit: 1 }))[0]?.content).toContain('黑猫');
    const secondRecall = await second.recall('那只猫怎么样了？', { limit: 1 });
    expect(secondRecall).toHaveLength(1);
    expect(secondRecall[0]?.content).toContain('二号直播间');
    expect(secondRecall[0]?.content).not.toContain('黑猫');
  });
});
