// @env node

import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { MockEmbeddingModelV3, MockLanguageModelV3 } from 'ai/test';
import sharp from 'sharp';
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

  it('允许感知策略绕过最小间隔提前触发思考', async () => {
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
      triggerPolicy: record =>
        record.content.type === 'text' && record.content.text === '现在回答'
          ? 'immediate'
          : 'scheduled',
    });
    nucleus.register(stimulus);
    nucleus.start();
    nucleus.ingest(stimulus, createReading('第一条', 0));
    await vi.advanceTimersByTimeAsync(0);
    await vi.waitFor(() => expect(model.doGenerateCalls).toHaveLength(1));

    await vi.advanceTimersByTimeAsync(100);
    nucleus.ingest(stimulus, createReading('现在回答', 100));
    await vi.advanceTimersByTimeAsync(0);
    expect(model.doGenerateCalls).toHaveLength(2);
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

  it('图片进入主思考与独立的经历归档，但原始痕迹仍可读取', async () => {
    const stimulus = new TestStimulus();
    const directory = await createTemporaryDirectory();
    const imagePath = await writeImage(directory, 'scene.jpg', '#ffffff');
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
    nucleus.ingest(stimulus, createReading('画面中出现了一只猫。', Date.now()));

    await vi.waitFor(() => expect(model.doGenerateCalls).toHaveLength(2));
    expect(JSON.stringify(model.doGenerateCalls[0]?.prompt)).toContain('image/jpeg');
    expect(JSON.stringify(model.doGenerateCalls[1]?.prompt)).toContain('image/jpeg');
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
    const inputs: NucleusInput[] = [];
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
    const memory = await createMemory();
    const stimulus = new TestStimulus();
    const model = createModel('已处理');
    const episodeAgent = {
      run: vi.fn(async () => '这段时间用户发来了一条消息。'),
    };
    const nucleus = new Nucleus({
      model,
      memory,
      memoryAgents: { episode: episodeAgent },
      memorySummary: { idleTimeout: 50, maxTokens: 10_000 },
    });
    nucleus.register(stimulus);
    nucleus.start();
    nucleus.ingest(stimulus, createReading('一条实时消息', Date.now()));

    await vi.waitFor(async () =>
      expect(await memory.readRecent()).toContain('这段时间用户发来了一条消息。'),
    );
    expect(model.doGenerateCalls).toHaveLength(1);
    expect(episodeAgent.run).toHaveBeenCalledOnce();
    expect(await memory.readRecent()).toContain('这段时间用户发来了一条消息。');
    await nucleus.stop();
  });
});
