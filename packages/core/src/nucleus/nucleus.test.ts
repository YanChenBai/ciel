// @env node

import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { Output } from 'ai';
import { MockEmbeddingModelV3, MockLanguageModelV3 } from 'ai/test';
import sharp from 'sharp';
import { afterEach, describe, expect, it, vi } from 'vite-plus/test';
import { z } from 'zod';

import type { ContextInput } from '#context';
import { Memory } from '#memory';
import { Reading, Sight } from '#percepts';
import { Photon, Script } from '#signals';
import { Stimulus } from '#stimulus';

import { Nucleus } from './nucleus.ts';

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

async function createMemory(model = createModel('经历摘要')): Promise<Memory> {
  const memory = createMemoryAt(model);
  await memory.readLongTerm();
  return memory;
}

function createMemoryAt(model = createModel('经历摘要')): Memory {
  const memory = new Memory({
    path: ':memory:',
    embedder: createEmbedder(),
    model,
    resourceId: 'test:nucleus',
  });
  memories.push(memory);
  return memory;
}

async function createTemporaryDirectory(): Promise<string> {
  const root = await mkdtemp(path.join(tmpdir(), 'ciel-nucleus-'));
  temporaryDirectories.push(root);
  return root;
}

async function writeImage(directory: string, name: string, background: string): Promise<string> {
  const imagePath = path.join(directory, name);
  await sharp({
    create: { width: 64, height: 36, channels: 3, background },
  })
    .jpeg()
    .toFile(imagePath);
  return imagePath;
}

function collectImageData(value: unknown, images: string[] = []): string[] {
  if (!value || typeof value !== 'object') {
    return images;
  }
  if ('mediaType' in value && value.mediaType === 'image/jpeg' && 'data' in value) {
    const data = value.data;
    if (data && typeof data === 'object' && 'data' in data && typeof data.data === 'string') {
      images.push(data.data);
    }
  }
  for (const child of Object.values(value)) {
    collectImageData(child, images);
  }
  return images;
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
  it('提供默认为空的 identity、soul 与 agent 属性', async () => {
    const nucleus = new Nucleus({
      memory: await createMemory(),
      model: createModel(),
    });

    expect(nucleus.identity).toBe('');
    expect(nucleus.soul).toBe('');
    expect(nucleus.agent).toBe('');
  });

  it('在 VAD 结束后触发思考，限制最小间隔并保留最大间隔兜底', async () => {
    const memory = await createMemory();
    vi.useFakeTimers();
    vi.setSystemTime(0);
    const stimulus = new TestStimulus();
    const model = createModel();
    const inputs: ContextInput[] = [];
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
    nucleus.speechEnd();
    await vi.advanceTimersByTimeAsync(0);
    await vi.waitFor(() => expect(model.doGenerateCalls).toHaveLength(1));
    await vi.advanceTimersByTimeAsync(0);
    expect(inputs[0]?.trigger).toBe('speech-end');

    await vi.advanceTimersByTimeAsync(100);
    nucleus.ingest(stimulus, createReading('第二条', 100));
    nucleus.speechEnd();
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

  it('普通感知只进入上下文，直到 VAD 结束才触发思考', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(0);
    const stimulus = new TestStimulus();
    const model = createModel();
    const nucleus = new Nucleus({
      model,
      memory: await createMemory(),
      memorySummary: { idleTimeout: 60_000 },
      minThinkInterval: 10_000,
      maxThinkInterval: 20_000,
    });
    nucleus.register(stimulus);
    nucleus.start();
    nucleus.ingest(stimulus, createReading('第一条', 0));
    await vi.advanceTimersByTimeAsync(0);
    expect(model.doGenerateCalls).toHaveLength(0);

    await vi.advanceTimersByTimeAsync(100);
    nucleus.ingest(stimulus, createReading('现在回答', 100));
    await vi.advanceTimersByTimeAsync(0);
    expect(model.doGenerateCalls).toHaveLength(0);

    nucleus.speechEnd();
    await vi.advanceTimersByTimeAsync(0);
    expect(model.doGenerateCalls).toHaveLength(1);
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

  it('只注入全局记忆与当前场景记忆', async () => {
    const currentScope = { id: 'room:100', label: '直播间 100（甲主播）' };
    const otherScope = { id: 'room:200', label: '直播间 200（乙主播）' };
    const memory = await createMemory();
    await memory.updateLongTerm('用户喜欢简洁互动。');
    await memory.updateLongTerm('甲主播喜欢聊猫。', { scope: currentScope });
    await memory.updateLongTerm('乙主播喜欢聊狗。', { scope: otherScope });
    await memory.appendEpisode('甲主播回应了弹幕。', new Date(), undefined, {
      scope: currentScope,
    });
    await memory.appendEpisode('乙主播回应了弹幕。', new Date(), undefined, {
      scope: otherScope,
    });
    const model = createModel('完成');
    const nucleus = new Nucleus({
      memory,
      memoryScope: () => currentScope,
      model,
    });

    expect(await nucleus.think()).toBe('完成');
    const prompt = JSON.stringify(model.doGenerateCalls[0]?.prompt);
    expect(prompt).toContain('用户喜欢简洁互动。');
    expect(prompt).toContain('甲主播喜欢聊猫。');
    expect(prompt).toContain('甲主播回应了弹幕。');
    expect(prompt).not.toContain('乙主播喜欢聊狗。');
    expect(prompt).not.toContain('乙主播回应了弹幕。');
  });

  it('独立 think 读取当前感知但不消费自动思考的 checkout', async () => {
    const stimulus = new TestStimulus();
    let calls = 0;
    const model = new MockLanguageModelV3({
      doGenerate: async () => {
        calls += 1;
        return response(calls === 1 ? '{"roomId":123,"reason":"值得观察"}' : '已看到当前直播内容');
      },
    });
    const nucleus = new Nucleus({ memory: await createMemory(), model });
    const normalThoughtInputs: ContextInput[] = [];
    nucleus.register(stimulus);
    nucleus.ingest(stimulus, createReading('当前正在唱歌', Date.now()));
    nucleus.on('thought', (_output, input) => normalThoughtInputs.push(input));

    await expect(
      nucleus.think({
        name: 'select-live-room',
        output: Output.object({
          schema: z.object({ reason: z.string(), roomId: z.number().int().positive() }),
        }),
        prompt: '选择一个直播间。',
      }),
    ).resolves.toEqual({ reason: '值得观察', roomId: 123 });
    expect(normalThoughtInputs).toEqual([]);

    await expect(nucleus.think()).resolves.toBe('已看到当前直播内容');
    expect(normalThoughtInputs[0]?.data.map(record => record.content)).toContainEqual({
      text: '当前正在唱歌',
      type: 'text',
    });
    expect(model.doGenerateCalls).toHaveLength(2);
  });

  it('图片进入主思考与独立的经历归档，但原始痕迹仍可读取', async () => {
    const stimulus = new TestStimulus();
    const directory = await createTemporaryDirectory();
    const imagePath = await writeImage(directory, 'scene.jpg', '#ffffff');
    const summaryModel = createModel('画面中出现了一只猫。');
    const memory = createMemoryAt(summaryModel);
    const model = new MockLanguageModelV3({ doGenerate: response('已处理', 100) });
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
    nucleus.ingest(stimulus, createReading('画面中出现了一只猫。', Date.now()));
    nucleus.speechEnd();

    await vi.waitFor(() => expect(summaryModel.doGenerateCalls).toHaveLength(1));
    expect(JSON.stringify(model.doGenerateCalls[0]?.prompt)).toContain('image/jpeg');
    expect(JSON.stringify(summaryModel.doGenerateCalls[0]?.prompt)).toContain('image/jpeg');
    expect(await memory.readRecent()).toContain('画面中出现了一只猫。');
    expect((await nucleus.getContext()).data.map(data => data.percept.type)).toEqual([
      'sight',
      'reading',
    ]);
    await nucleus.stop();
  });

  it('失败时重试冻结的变化帧，成功后不再重复上传', async () => {
    const stimulus = new TestStimulus();
    const directory = await createTemporaryDirectory();
    const firstPath = await writeImage(directory, 'first.jpg', '#000000');
    const secondPath = await writeImage(directory, 'second.jpg', '#ffffff');
    const laterPath = await writeImage(directory, 'later.jpg', '#ff0000');
    let attempts = 0;
    const model = new MockLanguageModelV3({
      doGenerate: async () => {
        attempts += 1;
        if (attempts === 1) {
          throw new Error('temporary provider failure');
        }
        return response('已处理');
      },
    });
    const nucleus = new Nucleus({ memory: await createMemory(), model });
    nucleus.register(stimulus);
    nucleus.ingest(
      stimulus,
      new Sight({
        path: firstPath,
        startAt: new Date(1),
        endAt: new Date(1),
        originSignal: TestPhoton,
      }),
    );
    nucleus.ingest(
      stimulus,
      new Sight({
        path: secondPath,
        startAt: new Date(2),
        endAt: new Date(2),
        originSignal: TestPhoton,
      }),
    );

    await expect(nucleus.think()).rejects.toThrow('temporary provider failure');
    await Promise.resolve();
    nucleus.ingest(
      stimulus,
      new Sight({
        path: laterPath,
        startAt: new Date(3),
        endAt: new Date(3),
        originSignal: TestPhoton,
      }),
    );
    await expect(nucleus.think()).resolves.toBe('已处理');
    await expect(nucleus.think()).resolves.toBe('已处理');
    await expect(nucleus.think()).resolves.toBe('已处理');

    const images = model.doGenerateCalls.map(call => collectImageData(call.prompt));
    expect(images.map(value => value.length)).toEqual([1, 1, 1, 0]);
    expect(images[1]).toEqual(images[0]);
    expect(images[2]).not.toEqual(images[1]);
  });

  it('每九个变化帧组成一张图，不足九帧也在本轮提交', async () => {
    const stimulus = new TestStimulus();
    const directory = await createTemporaryDirectory();
    const nucleus = new Nucleus({ memory: await createMemory(), model: createModel() });
    const inputs: ContextInput[] = [];
    nucleus.register(stimulus);
    nucleus.on('thought', (_output, input) => inputs.push(input));
    const paths = await Promise.all(
      Array.from({ length: 10 }, (_, index) =>
        writeImage(directory, `frame-${index}.jpg`, index % 2 === 0 ? '#000000' : '#ffffff'),
      ),
    );
    for (let index = 0; index < paths.length; index += 1) {
      nucleus.ingest(
        stimulus,
        new Sight({
          path: paths[index]!,
          startAt: new Date(index + 1),
          endAt: new Date(index + 1),
          originSignal: TestPhoton,
        }),
      );
    }

    await nucleus.think();

    const images = inputs[0]!.data.filter(entry => entry.content.type === 'image');
    expect(images.map(entry => [entry.time.startAt.getTime(), entry.time.endAt.getTime()])).toEqual(
      [
        [1, 9],
        [10, 10],
      ],
    );
    await expect(
      Promise.all(
        images.map(entry => {
          if (entry.content.type !== 'image') {
            throw new Error('Expected image context data');
          }
          return sharp(entry.content.path).metadata();
        }),
      ),
    ).resolves.toEqual([
      expect.objectContaining({ width: 1920, height: 1080 }),
      expect.objectContaining({ width: 1920, height: 1080 }),
    ]);
  });

  it('长时间没有新事件后总结经历', async () => {
    const summaryModel = createModel('这段时间用户发来了一条消息。');
    const memory = await createMemory(summaryModel);
    const stimulus = new TestStimulus();
    const model = createModel('已处理');
    const nucleus = new Nucleus({
      model,
      memory,
      memorySummary: { idleTimeout: 50, maxTokens: 10_000 },
    });
    nucleus.register(stimulus);
    nucleus.start();
    nucleus.ingest(stimulus, createReading('一条实时消息', Date.now()));

    await vi.waitFor(async () =>
      expect(await memory.readRecent()).toContain('这段时间用户发来了一条消息。'),
    );
    expect(model.doGenerateCalls).toHaveLength(0);
    expect(summaryModel.doGenerateCalls).toHaveLength(1);
    expect(await memory.readRecent()).toContain('这段时间用户发来了一条消息。');
    await nucleus.stop();
  });

  it('持续有新事件时仍按最大间隔总结经历', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(0);
    const summaryModel = createModel('持续活跃场景的阶段总结。');
    const memory = await createMemory(summaryModel);
    const stimulus = new TestStimulus();
    const nucleus = new Nucleus({
      model: createModel(),
      memory,
      memorySummary: { idleTimeout: 50, maxInterval: 120, maxTokens: 10_000 },
    });
    nucleus.register(stimulus);
    nucleus.start();
    nucleus.ingest(stimulus, createReading('第一条消息', 0));

    await vi.advanceTimersByTimeAsync(40);
    nucleus.ingest(stimulus, createReading('第二条消息', 40));
    await vi.advanceTimersByTimeAsync(40);
    nucleus.ingest(stimulus, createReading('第三条消息', 80));
    await vi.advanceTimersByTimeAsync(39);
    expect(summaryModel.doGenerateCalls).toHaveLength(0);

    await vi.advanceTimersByTimeAsync(1);
    await vi.waitFor(() => expect(summaryModel.doGenerateCalls).toHaveLength(1));
    expect(await memory.readRecent()).toContain('持续活跃场景的阶段总结。');
    await nucleus.stop();
  });

  it('归档失败时保留 checkout 并在退避后重试', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(0);
    let attempts = 0;
    const summaryModel = new MockLanguageModelV3({
      doGenerate: async () => {
        attempts += 1;
        if (attempts === 1) throw new Error('temporary summary failure');
        return response('重试后保存的经历。');
      },
    });
    const memory = await createMemory(summaryModel);
    const stimulus = new TestStimulus();
    const nucleus = new Nucleus({
      model: createModel(),
      memory,
      memorySummary: { idleTimeout: 50, maxTokens: 10_000 },
    });
    const errors: Error[] = [];
    nucleus.on('error', error => errors.push(error));
    nucleus.register(stimulus);
    nucleus.start();
    nucleus.ingest(stimulus, createReading('需要归档的消息', 0));

    await vi.advanceTimersByTimeAsync(50);
    expect(attempts).toBe(1);
    expect(errors[0]?.message).toBe('temporary summary failure');
    expect(await memory.readRecent()).not.toContain('重试后保存的经历。');

    await vi.advanceTimersByTimeAsync(999);
    expect(attempts).toBe(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(attempts).toBe(2);
    expect(await memory.readRecent()).toContain('重试后保存的经历。');
    await nucleus.stop();
  });
});
