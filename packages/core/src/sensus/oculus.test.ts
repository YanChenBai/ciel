// @env node

import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import sharp from 'sharp';
import { afterEach, describe, expect, it } from 'vite-plus/test';

import { Photon } from '#src/signals/index.ts';

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

describe('Oculus', () => {
  it('把一分钟的九个采样点拼成无黑边的 3 × 3 Sight', async () => {
    const outputDir = await mkdtemp(path.join(tmpdir(), 'ciel-oculus-grid-'));
    temporaryDirectories.push(outputDir);
    const oculus = new Oculus(TestPhoton, {
      differenceThreshold: 0,
      outputDir,
      sampleInterval: Math.ceil(60_000 / Oculus.FRAME_COUNT),
    });
    const sights: string[] = [];
    oculus.on('data', sight => sights.push(sight.path));
    const frames = await Promise.all(
      Array.from({ length: Oculus.FRAME_COUNT }, (_, index) =>
        frame(
          index % 2 === 0 ? '#000000' : '#ffffff',
          index * Math.ceil(60_000 / Oculus.FRAME_COUNT),
        ),
      ),
    );

    await Promise.all(frames.map(photon => oculus.process(photon)));

    expect(sights).toHaveLength(1);
    expect(await sharp(sights[0]!).metadata()).toMatchObject({ width: 1920, height: 1080 });
  });

  it('只拼接发生明显变化的帧，并跳过完全重复的观察窗口', async () => {
    const outputDir = await mkdtemp(path.join(tmpdir(), 'ciel-oculus-'));
    temporaryDirectories.push(outputDir);
    const oculus = new Oculus(TestPhoton, {
      differenceThreshold: 0.03,
      outputDir,
      sampleInterval: 0,
    });
    const sights: string[] = [];
    oculus.on('data', sight => sights.push(sight.path));

    const initialFrames = await Promise.all(
      Array.from({ length: Oculus.FRAME_COUNT }, (_, index) => frame('#000000', index)),
    );
    await Promise.all(initialFrames.map(photon => oculus.process(photon)));
    expect(sights).toHaveLength(1);
    expect(await sharp(sights[0]!).metadata()).toMatchObject({ width: 1920, height: 1080 });

    for (let index = 0; index < Oculus.FRAME_COUNT; index += 1) {
      await oculus.process(await frame('#000000', 20 + index));
    }
    expect(sights).toHaveLength(1);

    await oculus.process(await frame('#ffffff', 40));
    await oculus.process(await frame('#000000', 41));
    for (let index = 2; index < Oculus.FRAME_COUNT; index += 1) {
      await oculus.process(await frame('#000000', 40 + index));
    }
    expect(sights).toHaveLength(2);
    expect(await sharp(sights[1]!).metadata()).toMatchObject({ width: 1920, height: 1080 });
  });

  it('不足九帧时保留完整画面并选择占用面积最大的布局', async () => {
    const outputDir = await mkdtemp(path.join(tmpdir(), 'ciel-oculus-cover-'));
    temporaryDirectories.push(outputDir);
    const oculus = new Oculus(TestPhoton, {
      differenceThreshold: 0.03,
      outputDir,
      sampleInterval: 0,
    });
    const sights: string[] = [];
    oculus.on('data', sight => sights.push(sight.path));
    const colors = ['#ffffff', '#ff0000', '#00ff00', '#0000ff', '#ffff00'];

    for (let index = 0; index < Oculus.FRAME_COUNT; index += 1) {
      await oculus.process(await frame(colors[Math.min(index, colors.length - 1)]!, index));
    }

    expect(sights).toHaveLength(1);
    const unusedCorner = await sharp(sights[0]!)
      .extract({ left: 0, top: 0, width: 1, height: 1 })
      .raw()
      .toBuffer();
    const enlargedBottomFrame = await sharp(sights[0]!)
      .extract({
        left: 0,
        top: Oculus.OUTPUT_HEIGHT - 100,
        width: 1,
        height: 1,
      })
      .raw()
      .toBuffer();
    expect([...unusedCorner].reduce((sum, value) => sum + value, 0)).toBeLessThan(20);
    expect([...enlargedBottomFrame].reduce((sum, value) => sum + value, 0)).toBeGreaterThan(100);
  });
});
