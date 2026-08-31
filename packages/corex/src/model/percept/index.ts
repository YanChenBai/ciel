import { DataType } from '#model/data.ts';
import { DefinitionType } from '#model/definition.ts';
import { createId } from '#shared/id.ts';

import type {
  CreatePerceptOptions,
  DefinePerceptOptions,
  Percept,
  PerceptDefinition,
} from './types.ts';

export type {
  CreatePerceptOptions,
  DefinePerceptOptions,
  Percept,
  PerceptDefinition,
  PerceptOf,
} from './types.ts';

export function definePercept(options: DefinePerceptOptions): PerceptDefinition {
  const definition: PerceptDefinition = {
    ...options,

    type: DefinitionType.Percept,

    id: createId(),

    create(options: CreatePerceptOptions): Percept {
      return {
        type: DataType.Percept,
        id: createId(),
        definition,
        contents: options.contents,
        origin: options.origin,
        causes: options.causes,
        temporal: options.temporal,
        confidence: options.confidence,
      };
    },
  };

  return definition;
}
