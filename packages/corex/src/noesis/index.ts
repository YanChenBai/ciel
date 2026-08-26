import type { CueListener } from '../ciel/event-bus/index.ts';
import type { EngramReader } from '../engram/index.ts';
import { type CielModule, type Dispose, type MaybePromise, ModuleType } from '../types/index.ts';
import { createId } from '../utils/index.ts';

export interface NoesisSetupContext extends CueListener {
  /**
   * 只读访问已经形成的感知印记
   */
  readonly engram: EngramReader;

  onDispose(dispose: Dispose): void;
}

export interface DefineNoesisOptions {
  readonly name: string;

  readonly description: string;

  setup(ctx: NoesisSetupContext): MaybePromise<void>;
}

export interface Noesis extends DefineNoesisOptions, CielModule<typeof ModuleType.Noesis> {}

export type AnyNoesis = Noesis;

export function defineNoesis(options: DefineNoesisOptions): Noesis {
  return {
    ...options,
    type: ModuleType.Noesis,
    id: createId(),
  };
}
