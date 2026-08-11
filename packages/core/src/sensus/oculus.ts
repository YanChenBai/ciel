import fs from 'node:fs/promises';
import path from 'node:path';

import sharp from 'sharp';

import { Sight } from '#percepts';
import type { Photon } from '#signals';
import { DEFAULT_OCULUS_OUTPUT_DIR } from '#src/constants/index.ts';

import { SensusBase } from './base.ts';
import type { OculusOptions } from './types.ts';

export type { OculusEventMap, OculusOptions } from './types.ts';

interface FrameSlot {
  readonly frame: number;
  readonly height: number;
  readonly left: number;
  readonly top: number;
  readonly width: number;
}

/**
 * 接收 Photon 并形成 Sight 的视觉感官
 */
export class Oculus extends SensusBase<Photon, Sight> {
  static readonly COLS = 3;
  static readonly ROWS = 3;
  static readonly OUTPUT_WIDTH = 1920;
  static readonly OUTPUT_HEIGHT = 1080;
  static readonly DIFFERENCE_WIDTH = 64;
  static readonly DIFFERENCE_HEIGHT = 36;
  static readonly DEFAULT_DIFFERENCE_THRESHOLD = 0.03;

  static get FRAME_COUNT() {
    return Oculus.COLS * Oculus.ROWS;
  }

  private lastSampleAt?: number;
  private lastFingerprint?: Buffer;
  private readonly sampleInterval: number;
  private readonly differenceThreshold: number;
  private readonly outputDir: string;
  private sampledFrames = 0;
  private windowStartAt?: Date;
  private windowEndAt?: Date;
  private photons: Photon[] = [];
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

      if (
        this.lastSampleAt !== undefined &&
        photon.timestamp.getTime() - this.lastSampleAt < this.sampleInterval
      ) {
        return;
      }

      this.lastSampleAt = photon.timestamp.getTime();
      this.windowStartAt ??= photon.timestamp;
      this.windowEndAt = photon.timestamp;
      this.sampledFrames += 1;

      const fingerprint = await this.createFingerprint(photon);
      if (
        this.lastFingerprint === undefined ||
        this.getDifference(this.lastFingerprint, fingerprint) >= this.differenceThreshold
      ) {
        this.lastFingerprint = fingerprint;
        this.photons.push(photon);
      }

      if (this.sampledFrames < Oculus.FRAME_COUNT) {
        return;
      }

      const photons = this.photons;
      const startAt = this.windowStartAt;
      const endAt = this.windowEndAt;
      this.photons = [];
      this.sampledFrames = 0;
      this.windowStartAt = undefined;
      this.windowEndAt = undefined;

      if (photons.length === 0 || startAt === undefined || endAt === undefined) {
        return;
      }

      const sight = await this.createSight(photons, startAt, endAt);

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

  private async createSight(photons: Photon[], startAt: Date, endAt: Date): Promise<Sight> {
    const metadata = await Promise.all(photons.map(photon => sharp(photon.data).metadata()));
    const slots = this.createFrameSlots(
      metadata.map(value =>
        value.width && value.height
          ? value.width / value.height
          : Oculus.OUTPUT_WIDTH / Oculus.OUTPUT_HEIGHT,
      ),
    );

    const images = await Promise.all(
      slots.map(async slot => {
        return sharp(photons[slot.frame]!.data)
          .resize(slot.width, slot.height, {
            background: { r: 0, g: 0, b: 0 },
            fit: 'contain',
            position: 'centre',
          })
          .jpeg({
            quality: 85,
          })
          .toBuffer();
      }),
    );

    const outputWidth = Oculus.OUTPUT_WIDTH;
    const outputHeight = Oculus.OUTPUT_HEIGHT;

    const composite = slots.flatMap((slot, index) => [
      {
        input: images[index]!,
        left: slot.left,
        top: slot.top,
      },
      {
        input: this.createFrameLabel(slot.frame + 1),
        left: slot.left + 12,
        top: slot.top + 12,
      },
    ]);

    await fs.mkdir(this.outputDir, {
      recursive: true,
    });

    const filename = `${startAt.getTime()}-${endAt.getTime()}.jpg`;

    const outputPath = path.join(this.outputDir, filename);

    await sharp({
      create: {
        width: outputWidth,
        height: outputHeight,
        channels: 3,
        background: {
          r: 0,
          g: 0,
          b: 0,
        },
      },
    })
      .composite(composite)
      .jpeg({
        quality: 85,
      })
      .toFile(outputPath);

    return new Sight({
      path: outputPath,
      startAt,
      endAt,
      originSignal: this.signal,
    });
  }

  private createFrameSlots(aspectRatios: readonly number[]): FrameSlot[] {
    const minimumRows = Math.ceil(aspectRatios.length / Oculus.COLS);
    const maximumRows = Math.min(Oculus.ROWS, aspectRatios.length);
    let best: { area: number; slots: FrameSlot[] } | undefined;

    for (let rows = minimumRows; rows <= maximumRows; rows += 1) {
      const rowCounts = this.distributeFrames(aspectRatios.length, rows);
      const rowRatios: number[][] = [];
      let offset = 0;
      for (const count of rowCounts) {
        rowRatios.push(aspectRatios.slice(offset, offset + count));
        offset += count;
      }

      const maximumHeights = rowRatios.map(
        ratios => Oculus.OUTPUT_WIDTH / ratios.reduce((sum, ratio) => sum + ratio, 0),
      );
      const heightCap = this.resolveHeightCap(maximumHeights);
      const heights = maximumHeights.map(height =>
        Math.max(1, Math.floor(Math.min(height, heightCap))),
      );
      const totalHeight = heights.reduce((sum, height) => sum + height, 0);
      let top = Math.floor((Oculus.OUTPUT_HEIGHT - totalHeight) / 2);
      let frame = 0;
      const slots: FrameSlot[] = [];

      for (let row = 0; row < rows; row += 1) {
        const height = heights[row]!;
        const widths = rowRatios[row]!.map(ratio => Math.max(1, Math.floor(height * ratio)));
        let left = Math.floor(
          (Oculus.OUTPUT_WIDTH - widths.reduce((sum, width) => sum + width, 0)) / 2,
        );
        for (const width of widths) {
          slots.push({ frame, left, top, width, height });
          frame += 1;
          left += width;
        }
        top += height;
      }

      const area = slots.reduce((sum, slot) => sum + slot.width * slot.height, 0);
      if (best === undefined || area > best.area) best = { area, slots };
    }

    return best?.slots ?? [];
  }

  private distributeFrames(frameCount: number, rows: number): number[] {
    const base = Math.floor(frameCount / rows);
    const remainder = frameCount % rows;
    return Array.from({ length: rows }, (_, row) => base + Number(row < remainder));
  }

  private resolveHeightCap(maximumHeights: readonly number[]): number {
    const total = maximumHeights.reduce((sum, height) => sum + height, 0);
    if (total <= Oculus.OUTPUT_HEIGHT) return Math.max(...maximumHeights);

    let lower = 0;
    let upper = Math.max(...maximumHeights);
    for (let iteration = 0; iteration < 32; iteration += 1) {
      const middle = (lower + upper) / 2;
      const used = maximumHeights.reduce((sum, height) => sum + Math.min(height, middle), 0);
      if (used <= Oculus.OUTPUT_HEIGHT) lower = middle;
      else upper = middle;
    }
    return lower;
  }

  private createFrameLabel(frame: number): Buffer {
    return Buffer.from(
      `<svg width="44" height="44"><rect width="44" height="44" rx="8" fill="rgba(0,0,0,.7)"/><text x="22" y="30" text-anchor="middle" font-size="24" font-family="sans-serif" fill="white">${frame}</text></svg>`,
    );
  }
}
