// @env node

import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import sharp from 'sharp';
import { afterEach, describe, expect, it } from 'vite-plus/test';

import type { Sight } from '#percepts';
import { Photon } from '#signals';

import { Oculus } from './oculus.ts';

class TestPhoton extends Photon.WithMeta({ name: '画面', description: '测试画面' }) {}

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryDirectories.splice(0).map(directory => rm(directory, { recursive: true })),
  );
});

async function frame(background: string, timestamp: number): Promise<TestPhoton> {
  const data = await sharp({
    create: { width: 64, height: 36, channels: 3, background },
  })
    .jpeg()
    .toBuffer();
  return new TestPhoton({ data, timestamp: new Date(timestamp) });
}

async function createOculus(options: {
  differenceThreshold?: number;
  sampleInterval?: number;
}): Promise<{ oculus: Oculus; sights: Sight[] }> {
  const outputDir = await mkdtemp(path.join(tmpdir(), 'ciel-oculus-'));
  temporaryDirectories.push(outputDir);
  const oculus = new Oculus(TestPhoton, { ...options, outputDir });
  const sights: Sight[] = [];
  oculus.on('data', sight => sights.push(sight));
  return { oculus, sights };
}

describe('Oculus', () => {
  it('立即持久化并输出每个发生明显变化的采样帧', async () => {
    const { oculus, sights } = await createOculus({
      differenceThreshold: 0.03,
      sampleInterval: 0,
    });

    await oculus.process(await frame('#000000', 1));
    await oculus.process(await frame('#000000', 2));
    await oculus.process(await frame('#ffffff', 3));

    expect(sights).toHaveLength(2);
    expect(sights.map(sight => sight.startAt.getTime())).toEqual([1, 3]);
    expect(sights.map(sight => sight.endAt.getTime())).toEqual([1, 3]);
    await expect(Promise.all(sights.map(sight => sharp(sight.path).metadata()))).resolves.toEqual([
      expect.objectContaining({ width: 64, height: 36 }),
      expect.objectContaining({ width: 64, height: 36 }),
    ]);
  });

  it('与上一张已保留帧比较，使累积变化达到阈值后被接受', async () => {
    const { oculus, sights } = await createOculus({
      differenceThreshold: 0.3,
      sampleInterval: 0,
    });

    await oculus.process(await frame('#000000', 1));
    await oculus.process(await frame('#333333', 2));
    await oculus.process(await frame('#666666', 3));

    expect(sights.map(sight => sight.startAt.getTime())).toEqual([1, 3]);
  });

  it('按时间戳限频并忽略同一来源的非递增帧', async () => {
    const { oculus, sights } = await createOculus({
      differenceThreshold: 0,
      sampleInterval: 10,
    });

    await oculus.process(await frame('#000000', 100));
    await oculus.process(await frame('#ffffff', 100));
    await oculus.process(await frame('#ffffff', 109));
    await oculus.process(await frame('#ffffff', 110));

    expect(sights.map(sight => sight.startAt.getTime())).toEqual([100, 110]);
  });
});
