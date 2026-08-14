// @env node

import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { MockEmbeddingModelV3, MockLanguageModelV3 } from 'ai/test';
import sharp from 'sharp';
import { afterEach, describe, expect, it } from 'vite-plus/test';

import { Memory } from '#src/memory/index.ts';
import { Reading, Sight } from '#src/percepts/index.ts';
import { Photon, Script } from '#src/signals/index.ts';
import { Stimulus } from '#src/stimulus/index.ts';

import { Nucleus } from './nucleus.ts';

class TestPhoton extends Photon.WithMeta({ name: '画面', description: '最新视觉观察' }) {}
class TestScript extends Script.WithMeta({ name: '对话', description: '场景中的消息' }) {}
const signals = [TestPhoton, TestScript] as const;

class TestStimulus extends Stimulus<typeof signals> {
  static readonly meta = { name: '直播间', description: '直播场景' };
  readonly signals = signals;
  start(): void {}
  stop(): void {}
}

function createModel(text = '回应'): MockLanguageModelV3 {
  return new MockLanguageModelV3({
    doGenerate: {
      content: [{ type: 'text', text }],
      finishReason: { unified: 'stop', raw: undefined },
      usage: {
        inputTokens: { total: 1, noCache: 1, cacheRead: 0, cacheWrite: 0 },
        outputTokens: { total: 1, text: 1, reasoning: 0 },
      },
      warnings: [],
    },
  });
}

const temporaryDirectories: string[] = [];
const memories: Memory[] = [];

function createMemory(): Memory {
  const memory = new Memory({
    path: ':memory:',
    embedder: new MockEmbeddingModelV3({
      doEmbed: async ({ values }) => ({
        embeddings: values.map(() => [1, 0]),
        warnings: [],
      }),
    }),
    model: createModel('经历摘要'),
  });
  memories.push(memory);
  return memory;
}

afterEach(async () => {
  await Promise.all(memories.splice(0).map(memory => memory.close()));
  await Promise.all(
    temporaryDirectories.splice(0).map(directory =>
      rm(directory, {
        recursive: true,
        maxRetries: 5,
        retryDelay: 50,
      }),
    ),
  );
});

describe('Nucleus Prompt', () => {
  it('把定义放入 system，并把实时感知作为多模态本轮输入', async () => {
    const directory = await mkdtemp(path.join(tmpdir(), 'ciel-context-'));
    temporaryDirectories.push(directory);
    const imagePath = path.join(directory, 'scene.png');
    await sharp({
      create: { width: 64, height: 36, channels: 3, background: '#ffffff' },
    })
      .png()
      .toFile(imagePath);

    const stimulus = new TestStimulus();
    const model = createModel();
    const nucleus = new Nucleus({
      context: { perceptWindow: Number.MAX_SAFE_INTEGER },
      memory: createMemory(),
      model,
      system: ['# 自定义设定\n\n你是夏尔。'],
      messages: [() => ({ role: 'user', content: '当前任务' })],
    });
    nucleus.register(stimulus);
    nucleus.ingest(
      stimulus,
      new Reading({ content: '你好', timestamp: new Date(1), originSignal: TestScript }),
    );
    nucleus.ingest(
      stimulus,
      new Sight({
        path: imagePath,
        startAt: new Date(2),
        endAt: new Date(2),
        originSignal: TestPhoton,
      }),
    );
    const output = await nucleus.think();

    expect(output).toBe('回应');
    const call = model.doGenerateCalls[0];
    const serialized = JSON.stringify(call);
    expect(serialized).toContain('你是夏尔。');
    expect(serialized).toContain('# Stimulus 与 Percept 解释');
    expect(serialized).toContain('# 刺激源定义 (Stimulus)');
    expect(serialized).toContain('## 直播间');
    expect(serialized).toContain('# 回答约束');
    expect(serialized).toContain('不要暴露 Stimulus、Signal、Percept、Context、Nucleus');
    expect(serialized).toContain('# 对话 (Reading)');
    expect(serialized).toContain('## 场景中的消息');
    expect(serialized).toContain('# 画面 (Sight)');
    expect(serialized).toContain('同一人物或物体可能在不同帧重复出现');
    expect(serialized).toContain('当前任务');
    expect(serialized.indexOf('## 直播间')).toBeLessThan(serialized.indexOf('你是夏尔。'));
    expect(serialized.indexOf('你是夏尔。')).toBeLessThan(serialized.indexOf('# MEMORY'));
    expect(serialized.indexOf('# 对话 (Reading)')).toBeLessThan(serialized.indexOf('当前任务'));
    expect(call?.prompt.filter(message => message.role === 'system')).toHaveLength(1);
    expect(call?.prompt.some(message => message.role === 'user')).toBe(true);
  });

  it('自动提供记忆工具，并保护内置工具名称', async () => {
    const model = createModel();
    const directory = await mkdtemp(path.join(tmpdir(), 'ciel-tools-'));
    temporaryDirectories.push(directory);

    const nucleus = new Nucleus({ memory: createMemory(), model });
    await nucleus.think();
    const tools = JSON.stringify(model.doGenerateCalls[0]?.tools);
    expect(tools).toContain('memory_update');
    expect(tools).toContain('memory_recall');

    expect(
      () =>
        new Nucleus({
          memory: createMemory(),
          model,
          tools: { memory_update: { inputSchema: {} as never } },
        }),
    ).toThrow('reserved by Nucleus');
  });
});
