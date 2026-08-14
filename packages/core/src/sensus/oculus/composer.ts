// @env node

import path from 'node:path';

import sharp from 'sharp';

import { Sight } from '#percepts';

import { Oculus } from './oculus.ts';

interface FrameSlot {
  readonly frame: number;
  readonly height: number;
  readonly left: number;
  readonly top: number;
  readonly width: number;
}

export interface OculusComposerOptions {
  /** 每行最多容纳的画面数量。 */
  readonly columns?: number;

  /** 最终 JPEG 的编码质量，范围 1-100。 */
  readonly jpegQuality?: number;

  /** 最终合成图高度，单位为像素。 */
  readonly outputHeight?: number;

  /** 最终合成图宽度，单位为像素。 */
  readonly outputWidth?: number;

  /** 最多允许的画面行数。 */
  readonly rows?: number;
}

/**
 * 将同一视觉来源的一组变化帧拼成单个 Sight。
 */
export class OculusComposer {
  static readonly DEFAULT_JPEG_QUALITY = 85;
  static readonly DEFAULT_OUTPUT_HEIGHT = 1080;
  static readonly DEFAULT_OUTPUT_WIDTH = 1920;

  private readonly columns: number;
  private readonly jpegQuality: number;
  private readonly outputHeight: number;
  private readonly outputWidth: number;
  private readonly rows: number;

  constructor(options: OculusComposerOptions = {}) {
    this.columns = options.columns ?? Oculus.COLS;
    this.jpegQuality = options.jpegQuality ?? OculusComposer.DEFAULT_JPEG_QUALITY;
    this.outputHeight = options.outputHeight ?? OculusComposer.DEFAULT_OUTPUT_HEIGHT;
    this.outputWidth = options.outputWidth ?? OculusComposer.DEFAULT_OUTPUT_WIDTH;
    this.rows = options.rows ?? Oculus.ROWS;

    this.assertPositiveInteger(this.columns, 'columns');
    this.assertPositiveInteger(this.outputHeight, 'outputHeight');
    this.assertPositiveInteger(this.outputWidth, 'outputWidth');
    this.assertPositiveInteger(this.rows, 'rows');
    if (!Number.isInteger(this.jpegQuality) || this.jpegQuality < 1 || this.jpegQuality > 100) {
      throw new Error('OculusComposer jpegQuality must be an integer between 1 and 100');
    }
  }

  /**
   * 按时间排序画面，在不裁切的前提下选择占用面积最大的布局并输出 JPEG。
   */
  async compose(frames: readonly Sight[]): Promise<Sight> {
    const frameCount = this.columns * this.rows;
    if (frames.length === 0 || frames.length > frameCount) {
      throw new Error(`OculusComposer can compose between 1 and ${frameCount} frames`);
    }

    const sorted = frames.toSorted(
      (left, right) =>
        left.startAt.getTime() - right.startAt.getTime() ||
        left.endAt.getTime() - right.endAt.getTime(),
    );
    const first = sorted[0]!;
    const last = sorted.at(-1)!;
    if (sorted.some(frame => frame.originSignal !== first.originSignal)) {
      throw new Error('OculusComposer can only compose frames from the same signal source');
    }

    const metadata = await Promise.all(sorted.map(frame => sharp(frame.path).metadata()));
    const slots = this.createFrameSlots(
      metadata.map(value =>
        value.width && value.height
          ? value.width / value.height
          : this.outputWidth / this.outputHeight,
      ),
    );
    const images = await Promise.all(
      slots.map((slot, index) =>
        sharp(sorted[index]!.path)
          .resize(slot.width, slot.height, {
            background: { r: 0, g: 0, b: 0 },
            fit: 'contain',
            position: 'centre',
          })
          .jpeg({ quality: this.jpegQuality })
          .toBuffer(),
      ),
    );
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
    const firstName = path.parse(first.path).name;
    const lastName = path.parse(last.path).name;
    const outputPath = path.join(path.dirname(first.path), `context-${firstName}-${lastName}.jpg`);
    await sharp({
      create: {
        width: this.outputWidth,
        height: this.outputHeight,
        channels: 3,
        background: { r: 0, g: 0, b: 0 },
      },
    })
      .composite(composite)
      .jpeg({ quality: this.jpegQuality })
      .toFile(outputPath);

    return new Sight({
      path: outputPath,
      startAt: first.startAt,
      endAt: last.endAt,
      originSignal: first.originSignal,
    });
  }

  private assertPositiveInteger(value: number, name: string): void {
    if (!Number.isSafeInteger(value) || value <= 0) {
      throw new Error(`OculusComposer ${name} must be a positive integer`);
    }
  }

  private createFrameLabel(frame: number): Buffer {
    return Buffer.from(
      `<svg width="44" height="44"><rect width="44" height="44" rx="8" fill="rgba(0,0,0,.7)"/><text x="22" y="30" text-anchor="middle" font-size="24" font-family="sans-serif" fill="white">${frame}</text></svg>`,
    );
  }

  private createFrameSlots(aspectRatios: readonly number[]): FrameSlot[] {
    const minimumRows = Math.ceil(aspectRatios.length / this.columns);
    const maximumRows = Math.min(this.rows, aspectRatios.length);
    let best: { area: number; slots: FrameSlot[] } | undefined;

    // 穷举允许的行数，并保留画面总占用面积最大的候选布局。
    for (let rows = minimumRows; rows <= maximumRows; rows += 1) {
      const rowCounts = this.distributeFrames(aspectRatios.length, rows);
      const rowRatios: number[][] = [];
      let offset = 0;
      for (const count of rowCounts) {
        rowRatios.push(aspectRatios.slice(offset, offset + count));
        offset += count;
      }

      const maximumHeights = rowRatios.map(
        ratios => this.outputWidth / ratios.reduce((sum, ratio) => sum + ratio, 0),
      );
      const heightCap = this.resolveHeightCap(maximumHeights);
      const heights = maximumHeights.map(height =>
        Math.max(1, Math.floor(Math.min(height, heightCap))),
      );
      const totalHeight = heights.reduce((sum, height) => sum + height, 0);
      let top = Math.floor((this.outputHeight - totalHeight) / 2);
      let frame = 0;
      const slots: FrameSlot[] = [];

      for (let row = 0; row < rows; row += 1) {
        const height = heights[row]!;
        const widths = rowRatios[row]!.map(ratio => Math.max(1, Math.floor(height * ratio)));
        let left = Math.floor(
          (this.outputWidth - widths.reduce((sum, width) => sum + width, 0)) / 2,
        );
        for (const width of widths) {
          slots.push({ frame, left, top, width, height });
          frame += 1;
          left += width;
        }
        top += height;
      }

      const area = slots.reduce((sum, slot) => sum + slot.width * slot.height, 0);
      if (best === undefined || area > best.area) {
        best = { area, slots };
      }
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
    if (total <= this.outputHeight) {
      return Math.max(...maximumHeights);
    }

    // 二分求出统一行高上限，使所有行的总高度不超过输出画布。
    let lower = 0;
    let upper = Math.max(...maximumHeights);
    for (let iteration = 0; iteration < 32; iteration += 1) {
      const middle = (lower + upper) / 2;
      const used = maximumHeights.reduce((sum, height) => sum + Math.min(height, middle), 0);
      if (used <= this.outputHeight) {
        lower = middle;
      } else {
        upper = middle;
      }
    }
    return lower;
  }
}
