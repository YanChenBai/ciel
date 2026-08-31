import { DataType } from '#model/data.ts';
import { DefinitionType } from '#model/definition.ts';
import { createId } from '#shared/id.ts';

import type { DefineSignalOptions, SignalDefinition } from './types.ts';

export type {
  AnySignal,
  AnySignalDefinition,
  DefineSignalOptions,
  EmitSignal,
  Signal,
  SignalDefinition,
  SignalHandler,
  SignalListener,
  SignalOf,
  SignalReference,
} from './types.ts';

import type { AnySignal, SignalReference } from './types.ts';

export function defineSignal<TPayload = unknown>(
  options: DefineSignalOptions,
): SignalDefinition<TPayload> {
  const definition: SignalDefinition<TPayload> = {
    ...options,

    type: DefinitionType.Signal,

    id: createId(),

    create(payload, temporal) {
      return {
        type: DataType.Signal,
        id: createId(),
        definition,
        payload,
        temporal,
      };
    },
  };

  return definition;
}

export function referenceSignal(signal: AnySignal): SignalReference {
  return {
    id: signal.id,
    definition: signal.definition,
    temporal: signal.temporal,
  };
}
