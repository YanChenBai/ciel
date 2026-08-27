import type { AnyCue } from '../cue/index.ts';
import type { Engram } from '../engram/index.ts';
import type { Interceptor } from '../interceptor/index.ts';
import type { AnyNoesis } from '../noesis/index.ts';
import type { Sensu } from '../sensu/index.ts';
import type { AnyStimulus } from '../stimulus/index.ts';
import type { LifecycleStatus } from './lifecycle.ts';

export type InstallableCielModule = AnyStimulus | Sensu | AnyNoesis | Interceptor;

export interface DefineCielOptions {
  readonly modules: readonly InstallableCielModule[];
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
