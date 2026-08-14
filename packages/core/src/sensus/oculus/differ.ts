// @env node

import sharp from 'sharp';

import type { Photon } from '#signals';

export interface OculusDifferOptions {
  /** 灰度指纹高度，单位为像素。 */
  readonly height?: number;

  /** 与上一张已接受帧的平均像素差异阈值，范围 0-1。 */
  readonly threshold?: number;

  /** 灰度指纹宽度，单位为像素。 */
  readonly width?: number;
}

export interface OculusDifference {
  /** 当前画面是否达到变化阈值；第一张画面始终视为已变化。 */
  readonly changed: boolean;

  /** 与上一张已提交画面的平均归一化像素差；第一张画面没有该值。 */
  readonly ratio?: number;

  /** 在下游持久化成功后，将当前画面提交为新的比较基准。 */
  commit(): void;
}

/**
 * 将 Photon 压缩为灰度指纹，并始终与上一张已提交的指纹比较。
 */
export class OculusDiffer {
  static readonly DEFAULT_HEIGHT = 36;
  static readonly DEFAULT_THRESHOLD = 0.03;
  static readonly DEFAULT_WIDTH = 64;

  private readonly height: number;
  private previous?: Buffer;
  private readonly threshold: number;
  private readonly width: number;

  constructor(options: OculusDifferOptions = {}) {
    this.height = options.height ?? OculusDiffer.DEFAULT_HEIGHT;
    this.threshold = options.threshold ?? OculusDiffer.DEFAULT_THRESHOLD;
    this.width = options.width ?? OculusDiffer.DEFAULT_WIDTH;

    this.assertPositiveInteger(this.height, 'height');
    this.assertPositiveInteger(this.width, 'width');
    if (!Number.isFinite(this.threshold) || this.threshold < 0 || this.threshold > 1) {
      throw new Error('OculusDiffer threshold must be a finite number between 0 and 1');
    }
  }

  /**
   * 计算当前 Photon 与上一张已提交画面的差异，但不会提前改变比较基准。
   */
  async evaluate(photon: Photon): Promise<OculusDifference> {
    const current = await this.createFingerprint(photon);
    const ratio = this.previous ? this.compare(this.previous, current) : undefined;
    return {
      changed: ratio === undefined || ratio >= this.threshold,
      ...(ratio === undefined ? {} : { ratio }),
      commit: () => {
        this.previous = current;
      },
    };
  }

  private assertPositiveInteger(value: number, name: string): void {
    if (!Number.isSafeInteger(value) || value <= 0) {
      throw new Error(`OculusDiffer ${name} must be a positive integer`);
    }
  }

  private compare(previous: Buffer, current: Buffer): number {
    let difference = 0;
    for (let index = 0; index < current.length; index += 1) {
      difference += Math.abs(current[index]! - previous[index]!);
    }
    // 每个灰度像素最大相差 255，归一化后得到稳定的 0-1 比例。
    return difference / (current.length * 255);
  }

  /** 将原图统一缩放为低分辨率灰度数据，降低逐像素比较成本。 */
  private createFingerprint(photon: Photon): Promise<Buffer> {
    return sharp(photon.data)
      .resize(this.width, this.height, { fit: 'fill' })
      .grayscale()
      .raw()
      .toBuffer();
  }
}
