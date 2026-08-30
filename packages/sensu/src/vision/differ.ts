// @env node

import sharp from 'sharp';

export interface VisionDifferOptions {
  readonly height?: number;
  readonly threshold?: number;
  readonly width?: number;
}

export interface VisionDifference {
  readonly changed: boolean;
  readonly ratio?: number;
  commit(): void;
}

export class VisionDiffer {
  static readonly DEFAULT_HEIGHT = 36;
  static readonly DEFAULT_THRESHOLD = 0.03;
  static readonly DEFAULT_WIDTH = 64;

  private readonly height: number;
  private previous?: Buffer;
  private readonly threshold: number;
  private readonly width: number;

  constructor(options: VisionDifferOptions = {}) {
    this.height = options.height ?? VisionDiffer.DEFAULT_HEIGHT;
    this.threshold = options.threshold ?? VisionDiffer.DEFAULT_THRESHOLD;
    this.width = options.width ?? VisionDiffer.DEFAULT_WIDTH;

    this.assertPositiveInteger(this.height, 'height');
    this.assertPositiveInteger(this.width, 'width');
    if (!Number.isFinite(this.threshold) || this.threshold < 0 || this.threshold > 1) {
      throw new Error('VisionDiffer threshold must be a finite number between 0 and 1');
    }
  }

  async evaluate(data: Buffer): Promise<VisionDifference> {
    const current = await sharp(data)
      .resize(this.width, this.height, { fit: 'fill' })
      .grayscale()
      .raw()
      .toBuffer();
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
      throw new Error(`VisionDiffer ${name} must be a positive integer`);
    }
  }

  private compare(previous: Buffer, current: Buffer): number {
    let difference = 0;
    for (let index = 0; index < current.length; index += 1) {
      difference += Math.abs(current[index]! - previous[index]!);
    }
    return difference / (current.length * 255);
  }
}
