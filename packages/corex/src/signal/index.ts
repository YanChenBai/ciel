import {
  type CielData,
  type CielDefinition,
  type CielMetadata,
  DataType,
  DefinitionType,
  type Temporal,
} from '../types/index.ts';
import { createId } from '../utils/index.ts';

export type DefineSignalOptions = CielMetadata;

export interface SignalDefinition<TPayload = unknown> extends CielDefinition<
  typeof DefinitionType.Signal
> {
  readonly create: (payload: TPayload, temporal: Temporal) => Signal<TPayload>;
}

export interface Signal<TPayload = unknown> extends CielData<typeof DataType.Signal> {
  readonly definition: SignalDefinition<TPayload>;

  readonly payload: TPayload;

  readonly temporal: Temporal;
}

export type AnySignalDefinition = SignalDefinition<any>;

export type AnySignal = Signal<any>;

export type SignalOf<TDefinition extends AnySignalDefinition> =
  TDefinition extends SignalDefinition<infer TPayload> ? Signal<TPayload> : never;

export function defineSignal<TPayload = unknown>(
  options: DefineSignalOptions,
): SignalDefinition<TPayload> {
  const definition: SignalDefinition<TPayload> = {
    ...options,

    type: DefinitionType.Signal,

    id: createId(),

    create(payload: TPayload, temporal: Temporal) {
      return {
        type: DataType.Signal,
        definition,
        payload,
        temporal,
      };
    },
  };

  return definition;
}
