import type { Photon, SignalConstructor } from '#src/signals/index.ts';
import type { Stimulus } from '#src/stimulus/index.ts';

import type { ContextData } from './types.ts';

export interface VisionSource {
  readonly signal: SignalConstructor<Photon>;
  readonly stimulus: Stimulus;
}

export interface VisionCheckpoint extends VisionSource {
  readonly timestamp: number;
}

export interface VisionBatch extends VisionSource {
  readonly data: readonly ContextData[];
}

export interface VisionLease {
  readonly batches: readonly VisionBatch[];
  readonly checkpoints: readonly VisionCheckpoint[];
  readonly data: readonly ContextData[];
}

export interface PerceptCheckout {
  readonly createdAt: Date;
  readonly data: readonly ContextData[];
  readonly vision?: VisionLease;
}
