// @env node

import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import sharp from 'sharp';
import { afterEach, describe, expect, it } from 'vite-plus/test';

import { Sight } from '#percepts';
import { Photon } from '#signals';

import { OculusComposer } from './composer.ts';
import { Oculus } from './oculus.ts';

class TestPhoton extends Photon.WithMeta({ name: '画面', description: '测试画面' }) {}
class OtherPhoton extends Photon.WithMeta({ name: '其他画面', description: '其他测试画面' }) {}

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryDirectories.splice(0).map(directory => rm(directory, { recursive: true })),
  );
});

async function createSight(directory: string, timestamp: number): Promise<Sight> {
  const framePath = path.join(directory, `${timestamp}.jpg`);
  await sharp({
    create: {
      width: 64,
      height: 36,
      channels: 3,
      background: timestamp % 2 === 0 ? '#ffffff' : '#000000',
    },
  })
    .jpeg()
    .toFile(framePath);
  return new Sight({
    path: framePath,
    startAt: new Date(timestamp),
    endAt: new Date(timestamp),
    originSignal: TestPhoton,
  });
}

describe('OculusComposer', () => {
  it('按时间排列并将不足九个变化帧立即拼成 Sight', async () => {
    const directory = await mkdtemp(path.join(tmpdir(), 'ciel-oculus-composer-'));
    temporaryDirectories.push(directory);
    const frames = await Promise.all([3, 1, 2].map(timestamp => createSight(directory, timestamp)));

    const sight = await new OculusComposer().compose(frames);

    expect(sight.startAt.getTime()).toBe(1);
    expect(sight.endAt.getTime()).toBe(3);
    expect(sight.originSignal).toBe(TestPhoton);
    await expect(sharp(sight.path).metadata()).resolves.toMatchObject({
      width: 1920,
      height: 1080,
    });
  });

  it('拒绝空批次、超过九帧或混合视觉来源', async () => {
    const directory = await mkdtemp(path.join(tmpdir(), 'ciel-oculus-composer-invalid-'));
    temporaryDirectories.push(directory);
    const frame = await createSight(directory, 1);
    const other = new Sight({
      path: frame.path,
      startAt: frame.startAt,
      endAt: frame.endAt,
      originSignal: OtherPhoton,
    });

    const composer = new OculusComposer();
    await expect(composer.compose([])).rejects.toThrow('between 1 and 9 frames');
    await expect(
      composer.compose(Array.from({ length: Oculus.FRAME_COUNT + 1 }, () => frame)),
    ).rejects.toThrow('between 1 and 9 frames');
    await expect(composer.compose([frame, other])).rejects.toThrow('same signal source');
  });

  it('通过实例配置固定画布、网格容量和编码质量', async () => {
    const directory = await mkdtemp(path.join(tmpdir(), 'ciel-oculus-composer-options-'));
    temporaryDirectories.push(directory);
    const frames = await Promise.all([1, 2].map(timestamp => createSight(directory, timestamp)));
    const composer = new OculusComposer({
      columns: 2,
      jpegQuality: 80,
      outputHeight: 180,
      outputWidth: 320,
      rows: 1,
    });

    const sight = await composer.compose(frames);

    await expect(sharp(sight.path).metadata()).resolves.toMatchObject({
      width: 320,
      height: 180,
    });
    await expect(composer.compose([...frames, frames[0]!])).rejects.toThrow(
      'between 1 and 2 frames',
    );
  });
});
