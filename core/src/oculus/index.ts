import fs from 'node:fs/promises';
import path from 'node:path';

import sharp from 'sharp';

import { NanoEvents } from '#/events/index.ts';
import { DEFAULT_OCULUS_OUTPUT_DIR } from '#constants';
import { Sight } from '#perceptions';
import type { Photon } from '#signals';

export interface OculusOptions {
  /**
   * 两次采样之间的最小时间间隔，单位 ms
   */
  sampleInterval: number;

  /**
   * Sight 持久化目录
   */
  outputDir: string;
}

export interface OculusEventMap {
  sight(data: Sight): void;
}

export class Oculus extends NanoEvents<OculusEventMap> {
  static readonly COLS = 3;
  static readonly ROWS = 2;

  static get FRAME_COUNT() {
    return Oculus.COLS * Oculus.ROWS;
  }

  private lastSampleAt = 0;
  private readonly sampleInterval: number;
  private readonly outputDir: string;

  private photons: Photon[] = [];

  constructor(options: OculusOptions) {
    super();
    this.sampleInterval = options.sampleInterval;
    this.outputDir = options.outputDir ?? DEFAULT_OCULUS_OUTPUT_DIR;
  }

  observe(photon: Photon) {
    if (photon.capturedAt.getTime() - this.lastSampleAt < this.sampleInterval) {
      return;
    }

    this.lastSampleAt = photon.capturedAt.getTime();

    this.photons.push(photon);

    if (this.photons.length < Oculus.FRAME_COUNT) {
      return;
    }

    const photons = this.photons.splice(0, Oculus.FRAME_COUNT);

    void this.createSight(photons).then(sight => {
      this.emit('sight', sight);
    });
  }

  private async createSight(photons: Photon[]): Promise<Sight> {
    const width = 1920;
    const height = 1080;

    const images = await Promise.all(
      photons.map(async photon => {
        return sharp(photon.data)
          .resize(width, height, {
            fit: 'cover',
          })
          .jpeg({
            quality: 85,
          })
          .toBuffer();
      }),
    );

    const outputWidth = Oculus.COLS * width;
    const outputHeight = Oculus.ROWS * height;

    const composite = images.map((input, index) => ({
      input,
      left: (index % Oculus.COLS) * width,
      top: Math.floor(index / Oculus.COLS) * height,
    }));

    await fs.mkdir(this.outputDir, {
      recursive: true,
    });

    const startAt = photons[0]!.capturedAt;
    const endAt = photons.at(-1)!.capturedAt;

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
    });
  }
}
