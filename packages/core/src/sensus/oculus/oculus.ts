// @env node

import { randomUUID } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';

import sharp from 'sharp';

import { Sight } from '#percepts';
import type { Photon } from '#signals';
import { DEFAULT_OCULUS_OUTPUT_DIR } from '#src/constants/index.ts';

import { SensusBase } from '../base.ts';
import type { OculusOptions } from './types.ts';

/**
 * 接收 Photon，按采样频率与画面变化筛选并持久化视觉帧。
 */
export class Oculus extends SensusBase<Photon, Sight> {
  static readonly COLS = 3;
  static readonly ROWS = 3;
  static readonly DIFFERENCE_WIDTH = 64;
  static readonly DIFFERENCE_HEIGHT = 36;
  static readonly DEFAULT_DIFFERENCE_THRESHOLD = 0.03;

  static get FRAME_COUNT() {
    return Oculus.COLS * Oculus.ROWS;
  }

  private lastSampleAt?: number;
  private lastAcceptedFingerprint?: Buffer;
  private readonly sampleInterval: number;
  private readonly differenceThreshold: number;
  private readonly outputDir: string;
  private processing: Promise<void> = Promise.resolve();

  constructor(signal: typeof Photon, options: OculusOptions = {}) {
    super(signal);
    this.sampleInterval = options.sampleInterval ?? 60_000 / Oculus.FRAME_COUNT;
    this.differenceThreshold = options.differenceThreshold ?? Oculus.DEFAULT_DIFFERENCE_THRESHOLD;
    this.outputDir = options.outputDir ?? DEFAULT_OCULUS_OUTPUT_DIR;
    if (!Number.isFinite(this.sampleInterval) || this.sampleInterval < 0) {
      throw new Error('oculus.sampleInterval must be a non-negative finite number');
    }
    if (
      !Number.isFinite(this.differenceThreshold) ||
      this.differenceThreshold < 0 ||
      this.differenceThreshold > 1
    ) {
      throw new Error('oculus.differenceThreshold must be a finite number between 0 and 1');
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

      const fingerprint = await this.createFingerprint(photon);
      this.lastSampleAt = sampledAt;
      if (
        this.lastAcceptedFingerprint !== undefined &&
        this.getDifference(this.lastAcceptedFingerprint, fingerprint) < this.differenceThreshold
      ) {
        return;
      }

      const sight = await this.persist(photon);
      this.lastAcceptedFingerprint = fingerprint;
      this.emitData(sight);
    } catch (error) {
      this.emitError(error);
    }
  }

  private async createFingerprint(photon: Photon): Promise<Buffer> {
    return sharp(photon.data)
      .resize(Oculus.DIFFERENCE_WIDTH, Oculus.DIFFERENCE_HEIGHT, { fit: 'fill' })
      .grayscale()
      .raw()
      .toBuffer();
  }

  private getDifference(previous: Buffer, current: Buffer): number {
    let difference = 0;
    for (let index = 0; index < current.length; index += 1) {
      difference += Math.abs(current[index]! - previous[index]!);
    }
    return difference / (current.length * 255);
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
