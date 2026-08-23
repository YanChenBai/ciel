// @env node

import sharp from 'sharp';
import { describe, expect, it } from 'vite-plus/test';

import { Photon } from '#signals';

import { OculusDiffer } from './differ.ts';

class TestPhoton extends Photon.WithMeta({ name: '画面', description: '测试画面' }) {}

async function frame(background: string): Promise<TestPhoton> {
  const data = await sharp({
    create: { width: 64, height: 36, channels: 3, background },
  })
    .jpeg()
    .toBuffer();
  return new TestPhoton({ data, timestamp: new Date() });
}

describe('OculusDiffer', () => {
  it('始终与最后一次提交的帧比较', async () => {
    const differ = new OculusDiffer({ threshold: 0.3 });

    const first = await differ.evaluate(await frame('#000000'));
    expect(first.changed).toBe(true);
    expect(first.ratio).toBeUndefined();
    first.commit();

    const smallChange = await differ.evaluate(await frame('#333333'));
    expect(smallChange.changed).toBe(false);
    expect(smallChange.ratio).toBeCloseTo(0.2, 1);

    const accumulatedChange = await differ.evaluate(await frame('#666666'));
    expect(accumulatedChange.changed).toBe(true);
    expect(accumulatedChange.ratio).toBeCloseTo(0.4, 1);
  });

  it('只有显式提交才更新比较基准', async () => {
    const differ = new OculusDiffer({ threshold: 0.3 });
    const first = await differ.evaluate(await frame('#000000'));
    first.commit();

    const rejected = await differ.evaluate(await frame('#666666'));
    expect(rejected.changed).toBe(true);

    const sameCandidate = await differ.evaluate(await frame('#666666'));
    expect(sameCandidate.changed).toBe(true);
    rejected.commit();

    const committed = await differ.evaluate(await frame('#666666'));
    expect(committed.changed).toBe(false);
    expect(committed.ratio).toBeCloseTo(0, 5);
  });

  it('校验指纹尺寸与阈值', () => {
    expect(() => new OculusDiffer({ width: 0 })).toThrow('width must be a positive integer');
    expect(() => new OculusDiffer({ height: 1.5 })).toThrow('height must be a positive integer');
    expect(() => new OculusDiffer({ threshold: 1.1 })).toThrow(
      'threshold must be a finite number between 0 and 1',
    );
  });
});
