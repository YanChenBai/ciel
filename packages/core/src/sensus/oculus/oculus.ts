// @env node

import { randomUUID } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';

import sharp from 'sharp';

import { Sight } from '#percepts';
import type { Photon } from '#signals';
import { DEFAULT_OCULUS_OUTPUT_DIR } from '#src/constants/index.ts';

import { SensusBase } from '../base.ts';
import { OculusDiffer } from './differ.ts';
import type { OculusOptions } from './types.ts';

/**
 * 接收 Photon，按采样频率与画面变化筛选并持久化视觉帧。
 */
export class Oculus extends SensusBase<Photon, Sight> {
  static readonly COLS = 3;
  static readonly ROWS = 3;

  static get FRAME_COUNT() {
    return Oculus.COLS * Oculus.ROWS;
  }

  private lastSampleAt?: number;
  private readonly differ: OculusDiffer;
  private readonly sampleInterval: number;
  private readonly outputDir: string;
  private processing: Promise<void> = Promise.resolve();

  constructor(signal: typeof Photon, options: OculusOptions = {}) {
    super(signal);
    this.sampleInterval = options.sampleInterval ?? 60_000 / Oculus.FRAME_COUNT;
    this.differ = new OculusDiffer(
      options.differenceThreshold === undefined ? {} : { threshold: options.differenceThreshold },
    );
    this.outputDir = options.outputDir ?? DEFAULT_OCULUS_OUTPUT_DIR;
    if (!Number.isFinite(this.sampleInterval) || this.sampleInterval < 0) {
      throw new Error('oculus.sampleInterval must be a non-negative finite number');
    }
  }

  process(photon: Photon): Promise<void> {
    this.processing = this.processing.then(() => this.processPhoton(photon));
    return this.processing;
  }

  private async processPhoton(photon: Photon): Promise<void> {
    try {
      this.assertSignal(photon);

      const sampledAt = photon.timestamp.getTime();
      if (
        this.lastSampleAt !== undefined &&
        (sampledAt <= this.lastSampleAt || sampledAt - this.lastSampleAt < this.sampleInterval)
      ) {
        return;
      }

      // 先评估变化，只有持久化成功后才提交新的差异比较基准。
      const difference = await this.differ.evaluate(photon);
      this.lastSampleAt = sampledAt;
      if (!difference.changed) {
        return;
      }

      const sight = await this.persist(photon);
      difference.commit();
      this.emitData(sight);
    } catch (error) {
      this.emitError(error);
    }
  }

  private async persist(photon: Photon): Promise<Sight> {
    await fs.mkdir(this.outputDir, {
      recursive: true,
    });
    const outputPath = path.join(
      this.outputDir,
      `${photon.timestamp.getTime()}-${randomUUID()}.jpg`,
    );
    await sharp(photon.data)
      .jpeg({
        quality: 85,
      })
      .toFile(outputPath);

    return new Sight({
      path: outputPath,
      startAt: photon.timestamp,
      endAt: photon.timestamp,
      originSignal: this.signal,
    });
  }
}
