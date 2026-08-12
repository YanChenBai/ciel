import type { Sight } from '#percepts';

import type { SensusEventMap } from '../types.ts';

export type OculusEventMap = SensusEventMap<Sight>;

export interface OculusOptions {
  sampleInterval?: number;

  /** 与上一张已保留帧的平均像素差异达到该比例时才持久化，范围 0-1。 */
  differenceThreshold?: number;

  outputDir?: string;
}
