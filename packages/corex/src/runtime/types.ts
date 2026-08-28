import type { AnyCue } from '#model/cue/index.ts';
import type { Engram } from '#model/engram/index.ts';
import type { Interceptor } from '#modules/interceptor/index.ts';
import type { AnyNoesis } from '#modules/noesis/index.ts';
import type { AnyProjection } from '#modules/projection/index.ts';
import type { Sensu } from '#modules/sensu/index.ts';
import type { AnyStimulus } from '#modules/stimulus/index.ts';

import type { LifecycleStatus } from './lifecycle/index.ts';

export type InstallableCielModule = AnyStimulus | Sensu | AnyNoesis | AnyProjection | Interceptor;

export type InstallableCielModuleEntry = InstallableCielModule | readonly InstallableCielModule[];

export interface DefineCielOptions {
  readonly modules: readonly InstallableCielModuleEntry[];
}

export type CielStatus = LifecycleStatus;

export interface Ciel {
  readonly engram: Engram;

  readonly status: CielStatus;

  /**
   * 从 Ciel 外部手动派发认知线索
   */
  emitCue(cue: AnyCue): Promise<void>;

  start(): Promise<void>;

  stop(): Promise<void>;
}
