import type { CielData } from '#model/data.ts';
import type { CielDefinition } from '#model/definition.ts';
import type { Dispose, MaybePromise, Temporal } from '#shared';
import type { CielMetadata } from '#shared/metadata.ts';

export type DefineCueOptions = CielMetadata;

export type CreateCue<TPayload> = undefined extends TPayload
  ? (temporal: Temporal, payload?: TPayload) => Cue<TPayload>
  : (temporal: Temporal, payload: TPayload) => Cue<TPayload>;

export interface CueDefinition<TPayload = void> extends CielDefinition<'cue-definition'> {
  readonly create: CreateCue<TPayload>;
}

export interface Cue<TPayload = void> extends CielData<'cue'> {
  readonly definition: CueDefinition<TPayload>;
  readonly payload: TPayload;
  readonly temporal: Temporal;
}

export type AnyCueDefinition = CueDefinition<any>;
export type AnyCue = Cue<any>;
export type EmitCue = (cue: AnyCue) => Promise<void>;
export type CueOf<TDefinition extends AnyCueDefinition> =
  TDefinition extends CueDefinition<infer TPayload> ? Cue<TPayload> : never;

export type CueHandler<TDefinition extends AnyCueDefinition> = (
  cue: CueOf<TDefinition>,
) => MaybePromise<void>;

export type OnCue = <TDefinition extends AnyCueDefinition>(
  definition: TDefinition,
  handler: CueHandler<TDefinition>,
) => Dispose;

export interface CueListener {
  onCue: OnCue;
}
