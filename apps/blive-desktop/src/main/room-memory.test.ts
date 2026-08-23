// @env node

import { rm, mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { MockEmbeddingModelV3, MockLanguageModelV3 } from 'ai/test';
import { afterEach, describe, expect, it } from 'vite-plus/test';

import { RoomMemory } from './room-memory.ts';

const temporaryDirectories: string[] = [];
const memories: RoomMemory[] = [];

afterEach(async () => {
  await Promise.all(memories.splice(0).map(memory => memory.close()));
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map(directory =>
        rm(directory, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }),
      ),
  );
});

describe('RoomMemory', () => {
  it('在同一个数据库中按直播间隔离长期记忆', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'blive-room-memory-'));
    temporaryDirectories.push(directory);
    const memory = new RoomMemory({
      embedder: new MockEmbeddingModelV3({
        doEmbed: async ({ values }) => ({
          embeddings: values.map(() => [1, 0]),
          warnings: [],
        }),
      }),
      model: new MockLanguageModelV3({
        doGenerate: async () => ({
          content: [{ type: 'text', text: '经历摘要' }],
          finishReason: { unified: 'stop', raw: undefined },
          usage: {
            inputTokens: { total: 1, noCache: 1, cacheRead: 0, cacheWrite: 0 },
            outputTokens: { total: 1, text: 1, reasoning: 0 },
          },
          warnings: [],
        }),
      }),
      directory,
    });
    memories.push(memory);

    memory.select(100);
    await memory.updateLongTerm('一号房间记忆');
    memory.select(200);
    await memory.updateLongTerm('二号房间记忆');
    expect(await memory.readLongTerm()).toBe('二号房间记忆');

    memory.select(100);
    expect(await memory.readLongTerm()).toBe('一号房间记忆');
  });
});
