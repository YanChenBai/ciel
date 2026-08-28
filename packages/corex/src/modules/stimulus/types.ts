import type { AnySignal } from '#model/signal/index.ts';
import type { CielModule } from '#modules/types.ts';
import type { Dispose, MaybePromise } from '#shared/async.ts';
import type { CielMetadata } from '#shared/metadata.ts';

export interface StimulusSetupContext {
  emitSignal(signal: AnySignal): Promise<void>;
  onDispose(dispose: Dispose): void;
}

export interface DefineStimulusOptions extends CielMetadata {
  setup(this: void, ctx: StimulusSetupContext): MaybePromise<void>;
}

export interface Stimulus extends DefineStimulusOptions, CielModule<'stimulus'> {}
export type AnyStimulus = Stimulus;
