// @env node

import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { MockEmbeddingModelV3, MockLanguageModelV3 } from 'ai/test';
import { afterEach, describe, expect, it, vi } from 'vite-plus/test';

import { Memory } from '#src/memory/index.ts';
import { Reading, Sight } from '#src/percepts/index.ts';
import { Photon, Script } from '#src/signals/index.ts';
import { Stimulus } from '#src/stimulus/index.ts';

import { Nucleus } from './nucleus.ts';
import type { NucleusInput } from './types.ts';

class TestPhoton extends Photon.WithMeta({ name: '画面', description: '当前场景中的画面' }) {}
class TestScript extends Script.WithMeta({ name: '对话', description: '当前场景中的消息' }) {}
const signals = [TestPhoton, TestScript] as const;

class TestStimulus extends Stimulus<typeof signals> {
  static readonly meta = { name: '直播间', description: '直播场景' };
  readonly signals = signals;
  start(): void {}
  stop(): void {}
}

function response(text: string, inputTokens = 1) {
  return {
    content: [{ type: 'text' as const, text }],
    finishReason: { unified: 'stop' as const, raw: undefined },
    usage: {
      inputTokens: { total: inputTokens, noCache: inputTokens, cacheRead: 0, cacheWrite: 0 },
      outputTokens: { total: 1, text: 1, reasoning: 0 },
    },
    warnings: [],
  };
}

function createModel(text = '保持安静'): MockLanguageModelV3 {
  return new MockLanguageModelV3({ doGenerate: response(text) });
}

function createReading(content: string, timestamp: number): Reading {
  return new Reading({ content, timestamp: new Date(timestamp), originSignal: TestScript });
}

const temporaryDirectories: string[] = [];
const memories: Memory[] = [];

function createEmbedder(): MockEmbeddingModelV3 {
  return new MockEmbeddingModelV3({
    doEmbed: async ({ values }) => ({
      embeddings: values.map(() => [1, 0]),
      warnings: [],
    }),
  });
}

async function createMemory(): Promise<Memory> {
  const memory = createMemoryAt();
  await memory.readLongTerm();
  return memory;
}

function createMemoryAt(): Memory {
  const memory = new Memory({
    path: ':memory:',
    embedder: createEmbedder(),
  });
  memories.push(memory);
  return memory;
}

async function createTemporaryDirectory(): Promise<string> {
  const root = await mkdtemp(path.join(tmpdir(), 'ciel-nucleus-'));
  temporaryDirectories.push(root);
  return root;
}

afterEach(async () => {
  vi.useRealTimers();
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

describe('Nucleus', () => {
  it('限制连续思考频率，并在最大间隔后主动思考', async () => {
    const memory = await createMemory();
    vi.useFakeTimers();
    vi.setSystemTime(0);
    const stimulus = new TestStimulus();
    const model = createModel();
    const inputs: NucleusInput[] = [];
    const thoughtTimes: number[] = [];
    const nucleus = new Nucleus({
      model,
      memory,
      memorySummary: { idleTimeout: 60_000 },
      minThinkInterval: 1_000,
      maxThinkInterval: 5_000,
    });
    nucleus.register(stimulus);
    nucleus.on('thought', (_output, input) => {
      inputs.push(input);
      thoughtTimes.push(Date.now());
    });

    nucleus.start();
    nucleus.ingest(stimulus, createReading('第一条', 0));
    await vi.advanceTimersByTimeAsync(0);
    await vi.waitFor(() => expect(model.doGenerateCalls).toHaveLength(1));
    await vi.advanceTimersByTimeAsync(0);
    expect(inputs[0]?.trigger).toBe('percept');

    await vi.advanceTimersByTimeAsync(100);
    nucleus.ingest(stimulus, createReading('第二条', 100));
    const beforeNextThought = (thoughtTimes[0] ?? 0) + 999 - Date.now();
    await vi.advanceTimersByTimeAsync(beforeNextThought);
    expect(model.doGenerateCalls).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(model.doGenerateCalls).toHaveLength(2);

    await vi.advanceTimersByTimeAsync(4_999);
    expect(model.doGenerateCalls).toHaveLength(2);
    await vi.advanceTimersByTimeAsync(1);
    expect(model.doGenerateCalls).toHaveLength(3);
    expect(inputs[2]?.trigger).toBe('interval');
    await nucleus.stop();
  });

  it('把长期记忆和最近经历注入上下文', async () => {
    const stimulus = new TestStimulus();
    const memory = await createMemory();
    await memory.updateLongTerm('用户喜欢简洁回答。');
    await memory.appendEpisode('用户此前正在检查直播。', new Date());
    const model = createModel('完成');
    const nucleus = new Nucleus({ memory, model });
    nucleus.register(stimulus);
    nucleus.ingest(stimulus, createReading('刚刚发生的事情', Date.now()));

    expect(await nucleus.think()).toBe('完成');
    const prompt = JSON.stringify(model.doGenerateCalls[0]?.prompt);
    expect(prompt).toContain('# MEMORY');
    expect(prompt).toContain('用户喜欢简洁回答。');
    expect(prompt).toContain('# 最近经历');
    expect(prompt).toContain('用户此前正在检查直播。');
  });

  it('图片输入达到 token 阈值后作为多模态经历总结', async () => {
    const stimulus = new TestStimulus();
    const directory = await createTemporaryDirectory();
    const imagePath = path.join(directory, 'scene.jpg');
    await writeFile(imagePath, Buffer.from([1, 2, 3]));
    const memory = createMemoryAt();
    const model = new MockLanguageModelV3({
      doGenerate: [response('已处理', 100), response('画面中出现了一只猫。')],
    });
    const nucleus = new Nucleus({
      model,
      memory,
      memorySummary: { maxTokens: 100 },
    });
    nucleus.register(stimulus);
    nucleus.start();
    nucleus.ingest(
      stimulus,
      new Sight({
        path: imagePath,
        startAt: new Date(),
        endAt: new Date(),
        originSignal: TestPhoton,
      }),
    );

    await vi.waitFor(() => expect(model.doGenerateCalls).toHaveLength(2));
    expect(JSON.stringify(model.doGenerateCalls[1]?.prompt)).toContain('image/jpeg');
    expect(await memory.readRecent()).toContain('画面中出现了一只猫。');
    expect((await nucleus.getContext()).data).toEqual([]);
    await nucleus.stop();
  });

  it('长时间没有新事件后总结经历', async () => {
    const memory = await createMemory();
    const stimulus = new TestStimulus();
    const model = new MockLanguageModelV3({
      doGenerate: [response('已处理'), response('这段时间用户发来了一条消息。')],
    });
    const nucleus = new Nucleus({
      model,
      memory,
      memorySummary: { idleTimeout: 50, maxTokens: 10_000 },
    });
    nucleus.register(stimulus);
    nucleus.start();
    nucleus.ingest(stimulus, createReading('一条实时消息', Date.now()));

    await vi.waitFor(() => expect(model.doGenerateCalls).toHaveLength(2));
    expect(await memory.readRecent()).toContain('这段时间用户发来了一条消息。');
    await nucleus.stop();
  });
});
