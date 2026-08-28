import type { EmitSignal } from '#model/signal/index.ts';
import type { CielModule } from '#modules/types.ts';
import type { MaybePromise, OnDispose } from '#shared/async.ts';
import type { CielMetadata } from '#shared/metadata.ts';

export interface StimulusSetupContext {
  emitSignal: EmitSignal;
  onDispose: OnDispose;
}

export interface DefineStimulusOptions extends CielMetadata {
  setup(this: void, ctx: StimulusSetupContext): MaybePromise<void>;
}

export interface Stimulus extends DefineStimulusOptions, CielModule<'stimulus'> {}
export type AnyStimulus = Stimulus;
