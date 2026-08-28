import type { CielData } from '#model/data.ts';
import type { CielDefinition } from '#model/definition.ts';
import type { Dispose, MaybePromise, Temporal } from '#shared';
import type { CielMetadata } from '#shared/metadata.ts';

export type DefineCueOptions = CielMetadata;

export interface CueDefinition<TPayload = unknown> extends CielDefinition<'cue-definition'> {
  readonly create: (payload: TPayload, temporal: Temporal) => Cue<TPayload>;
}

export interface Cue<TPayload = unknown> extends CielData<'cue'> {
  readonly definition: CueDefinition<TPayload>;
  readonly payload: TPayload;
  readonly temporal: Temporal;
}

export type AnyCueDefinition = CueDefinition<any>;
export type AnyCue = Cue<any>;
export type CueOf<TDefinition extends AnyCueDefinition> =
  TDefinition extends CueDefinition<infer TPayload> ? Cue<TPayload> : never;

export interface CueListener {
  onCue<TDefinition extends AnyCueDefinition>(
    definition: TDefinition,
    handler: (cue: CueOf<TDefinition>) => MaybePromise<void>,
  ): Dispose;
}
