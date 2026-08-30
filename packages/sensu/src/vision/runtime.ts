// @env node

import type { Signal } from 'corex';
import sharp from 'sharp';

import { Sight } from '../definitions.ts';
import type { PhotonPayload } from '../types.ts';
import { VisionDiffer } from './differ.ts';

export interface VisionRuntimeOptions {
  readonly differenceThreshold?: number;
  readonly sampleInterval?: number;
}

function sampledAt(signal: Signal<PhotonPayload>): number {
  return signal.temporal.kind === 'instant' ? signal.temporal.at : signal.temporal.end;
}

export class VisionRuntime {
  private readonly differ: VisionDiffer;
  private lastSampleAt?: number;
  private processing: Promise<void> = Promise.resolve();
  private readonly sampleInterval: number;

  constructor(options: VisionRuntimeOptions = {}) {
    this.sampleInterval = options.sampleInterval ?? 60_000 / 9;
    this.differ = new VisionDiffer(
      options.differenceThreshold === undefined ? {} : { threshold: options.differenceThreshold },
    );
    if (!Number.isFinite(this.sampleInterval) || this.sampleInterval < 0) {
      throw new Error('vision.sampleInterval must be a non-negative finite number');
    }
  }

  process(signal: Signal<PhotonPayload>): Promise<ReturnType<typeof Sight.create> | undefined> {
    const current = this.processing.then(() => this.processFrame(signal));
    this.processing = current.then(
      () => undefined,
      () => undefined,
    );
    return current;
  }

  private async processFrame(
    signal: Signal<PhotonPayload>,
  ): Promise<ReturnType<typeof Sight.create> | undefined> {
    const timestamp = sampledAt(signal);
    if (
      this.lastSampleAt !== undefined &&
      (timestamp <= this.lastSampleAt || timestamp - this.lastSampleAt < this.sampleInterval)
    ) {
      return undefined;
    }

    const difference = await this.differ.evaluate(signal.payload.data);
    this.lastSampleAt = timestamp;
    if (!difference.changed) return undefined;

    const image = await sharp(signal.payload.data).jpeg({ quality: 85 }).toBuffer();
    difference.commit();
    return Sight.create({
      source: signal,
      temporal: signal.temporal,
      contents: [{ type: 'image', data: image, mimeType: 'image/jpeg' }],
    });
  }
}
