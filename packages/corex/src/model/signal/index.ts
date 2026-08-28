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
} from './types.ts';

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
        definition,
        payload,
        temporal,
      };
    },
  };

  return definition;
}
