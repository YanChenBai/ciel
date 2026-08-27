import type { AnySignal } from '../signal/index.ts';
import { type CielModule, type Dispose, type MaybePromise, ModuleType } from '../types/index.ts';
import { createId } from '../utils/index.ts';

export interface StimulusSetupContext {
  emitSignal(signal: AnySignal): Promise<void>;

  onDispose(dispose: Dispose): void;
}

export interface DefineStimulusOptions {
  readonly name: string;

  readonly description?: string;

  setup(this: void, ctx: StimulusSetupContext): MaybePromise<void>;
}

export interface Stimulus extends DefineStimulusOptions, CielModule<typeof ModuleType.Stimulus> {}

export type AnyStimulus = Stimulus;

export function defineStimulus(options: DefineStimulusOptions): Stimulus {
  return {
    ...options,
    type: ModuleType.Stimulus,
    id: createId(),
  };
}
