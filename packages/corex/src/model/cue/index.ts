import { DataType } from '#model/data.ts';
import { DefinitionType } from '#model/definition.ts';
import type { Temporal } from '#shared';
import { createId } from '#shared/id.ts';

import type { CreateCue, CueDefinition, DefineCueOptions } from './types.ts';

export type {
  AnyCue,
  AnyCueDefinition,
  Cue,
  CreateCue,
  CueDefinition,
  CueOf,
  DefineCueOptions,
} from './types.ts';

/**
 * 定义用于触发认知处理的线索, Cue 不会自动写入 Engram
 */
export function defineCue<TPayload = void>(options: DefineCueOptions): CueDefinition<TPayload> {
  const definition: CueDefinition<TPayload> = {
    ...options,
    type: DefinitionType.Cue,
    id: createId(),
    create: ((temporal: Temporal, payload?: TPayload) => {
      return {
        type: DataType.Cue,
        definition,
        payload,
        temporal,
      };
    }) as CreateCue<TPayload>,
  };

  return definition;
}
