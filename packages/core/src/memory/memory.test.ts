// @env node

import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { MockEmbeddingModelV3 } from 'ai/test';
import { afterEach, describe, expect, it } from 'vite-plus/test';

import { Memory } from './memory.ts';

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
    recentDays,
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

    const recalled = await memory.recall('那只猫是什么时候来的？', 1);

    expect(recalled).toHaveLength(1);
    expect(recalled[0]?.content).toContain('黑猫');
  });
});
