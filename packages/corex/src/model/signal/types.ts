import type { CielData } from '#model/data.ts';
import type { CielDefinition } from '#model/definition.ts';
import type { Dispose, MaybePromise, Temporal } from '#shared';
import type { CielMetadata } from '#shared/metadata.ts';

export type DefineSignalOptions = CielMetadata;

export interface SignalDefinition<TPayload = unknown> extends CielDefinition<'signal-definition'> {
  readonly create: (payload: TPayload, temporal: Temporal) => Signal<TPayload>;
}

export interface Signal<TPayload = unknown> extends CielData<'signal'> {
  readonly definition: SignalDefinition<TPayload>;
  readonly payload: TPayload;
  readonly temporal: Temporal;
}

export type AnySignalDefinition = SignalDefinition<any>;
export type AnySignal = Signal<any>;
export type EmitSignal = (signal: AnySignal) => Promise<void>;
export type SignalOf<TDefinition extends AnySignalDefinition> =
  TDefinition extends SignalDefinition<infer TPayload> ? Signal<TPayload> : never;

export type SignalHandler<TDefinition extends AnySignalDefinition> = (
  signal: SignalOf<TDefinition>,
) => MaybePromise<void>;

export interface SignalListener {
  onSignal<TDefinition extends AnySignalDefinition>(
    definition: TDefinition,
    handler: SignalHandler<TDefinition>,
  ): Dispose;
}
