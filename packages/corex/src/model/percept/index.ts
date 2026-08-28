import { DataType } from '#model/data.ts';
import { DefinitionType } from '#model/definition.ts';
import type { Signal } from '#model/signal/index.ts';
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

    create<TSource extends Signal<any>>(options: CreatePerceptOptions<TSource>): Percept<TSource> {
      return {
        type: DataType.Percept,
        definition,
        contents: options.contents,
        source: options.source,
        temporal: options.temporal,
        confidence: options.confidence,
      };
    },
  };

  return definition;
}
