// @env node

import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { MockLanguageModelV3 } from 'ai/test';
import sharp from 'sharp';
import { afterEach, describe, expect, it, vi } from 'vite-plus/test';

import { Sight } from '#src/percepts/index.ts';
import { Photon } from '#src/signals/index.ts';
import { Stimulus } from '#src/stimulus/index.ts';

import { Nucleus } from './nucleus.ts';

class TestPhoton extends Photon.WithMeta({ name: '画面', description: '场景画面' }) {}
const signals = [TestPhoton] as const;

class TestStimulus extends Stimulus<typeof signals> {
  static readonly meta = { name: '直播间', description: '视觉测试场景' };
  readonly signals = signals;
  start(): void {}
  stop(): void {}
}

function response(text: string) {
  return {
    content: [{ type: 'text' as const, text }],
    finishReason: { unified: 'stop' as const, raw: undefined },
    usage: {
      inputTokens: { total: 1, noCache: 1, cacheRead: 0, cacheWrite: 0 },
      outputTokens: { total: 1, text: 1, reasoning: 0 },
    },
    warnings: [],
  };
}

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryDirectories.splice(0).map(directory => rm(directory, { recursive: true })),
  );
});

async function createImages(): Promise<{ blank: string; content: string }> {
  const directory = await mkdtemp(path.join(tmpdir(), 'ciel-episode-'));
  temporaryDirectories.push(directory);
  const blank = path.join(directory, 'blank.jpg');
  const content = path.join(directory, 'content.jpg');
  await sharp({
    create: { width: 64, height: 64, channels: 3, background: '#000000' },
  })
    .jpeg()
    .toFile(blank);
  await sharp({
    create: { width: 64, height: 64, channels: 3, background: '#000000' },
  })
    .composite([
      {
        input: Buffer.from(
          '<svg width="64" height="64"><rect x="0" y="0" width="32" height="32" fill="white"/><rect x="32" y="32" width="32" height="32" fill="white"/></svg>',
        ),
      },
    ])
    .jpeg()
    .toFile(content);
  return { blank, content };
}

function sight(path: string, timestamp: number): Sight {
  return new Sight({
    path,
    startAt: new Date(timestamp),
    endAt: new Date(timestamp),
    originSignal: TestPhoton,
  });
}

describe('EpisodeRecorder', () => {
  it('把 Oculus 图片直接交给多模态模型，并跳过空白画面', async () => {
    const images = await createImages();
    const stimulus = new TestStimulus();
    const model = new MockLanguageModelV3({
      doGenerate: [response('观察完成'), response('画面中出现了黑白棋盘格。')],
    });
    const nucleus = new Nucleus({
      model,
      memory: {
        path: ':memory:',
        episode: { maxImages: 4, minVisualEntropy: 0.05 },
      },
    });
    nucleus.register(stimulus);
    nucleus.ingest(stimulus, sight(images.blank, 1));
    nucleus.ingest(stimulus, sight(images.content, 2));

    await nucleus.think();
    await nucleus.flushEpisode();

    expect(model.doGenerateCalls).toHaveLength(2);
    const summaryPrompt = JSON.stringify(model.doGenerateCalls[1]?.prompt);
    expect(summaryPrompt).toContain('image/jpeg');
    expect(summaryPrompt.match(/image\/jpeg/g)).toHaveLength(1);
    const memory = nucleus.getMemory();
    const recalled = await memory.getContext({ longTermLimit: 0, episodicLimit: 1 });
    expect(recalled.entries[0]?.content).toEqual({
      type: 'text',
      text: '画面中出现了黑白棋盘格。',
    });
    await memory.close();
  });

  it('只有空白画面时不生成情景摘要', async () => {
    const images = await createImages();
    const stimulus = new TestStimulus();
    const model = new MockLanguageModelV3({ doGenerate: response('保持安静') });
    const nucleus = new Nucleus({ model, memory: { path: ':memory:' } });
    nucleus.register(stimulus);
    nucleus.ingest(stimulus, sight(images.blank, 1));

    await nucleus.think();
    await nucleus.flushEpisode();

    expect(model.doGenerateCalls).toHaveLength(1);
    const memory = nucleus.getMemory();
    const recalled = await memory.getContext({ longTermLimit: 0, episodicLimit: 1 });
    expect(recalled.entries).toEqual([]);
    await memory.close();
  });

  it('图片缓存达到阈值后自动结算，并限制主推理的图片数量', async () => {
    const images = await createImages();
    const stimulus = new TestStimulus();
    const model = new MockLanguageModelV3({
      doGenerate: [response('观察完成'), response('连续画面已归档。')],
    });
    const nucleus = new Nucleus({
      model,
      context: { maxImages: 1 },
      memory: {
        path: ':memory:',
        episode: { maxBufferedImages: 2, maxImages: 2 },
      },
    });
    nucleus.register(stimulus);
    const now = Date.now();
    nucleus.ingest(stimulus, sight(images.content, now - 1));
    nucleus.ingest(stimulus, sight(images.content, now));

    await nucleus.think();
    await vi.waitFor(() => expect(model.doGenerateCalls).toHaveLength(2));

    const thoughtPrompt = JSON.stringify(model.doGenerateCalls[0]?.prompt);
    expect(thoughtPrompt.match(/image\/jpeg/g)).toHaveLength(1);
    expect((await nucleus.getContext()).data).toEqual([]);
    await nucleus.getMemory().close();
  });
});
