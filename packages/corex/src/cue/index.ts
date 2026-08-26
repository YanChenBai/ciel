import type { Temporal } from '../temporal/index.ts';
import { type CielData, type CielDefinition, DataType, DefinitionType } from '../types/index.ts';
import { createId } from '../utils/index.ts';

export interface DefineCueOptions {
  readonly name: string;

  readonly description: string;
}

export interface CueDefinition<TPayload = unknown> extends CielDefinition<
  typeof DefinitionType.Cue
> {
  readonly create: (payload: TPayload, temporal: Temporal) => Cue<TPayload>;
}

export interface Cue<TPayload = unknown> extends CielData<typeof DataType.Cue> {
  readonly definition: CueDefinition<TPayload>;

  readonly payload: TPayload;

  readonly temporal: Temporal;
}

export type AnyCueDefinition = CueDefinition<any>;

export type AnyCue = Cue<any>;

export type CueOf<TDefinition extends AnyCueDefinition> =
  TDefinition extends CueDefinition<infer TPayload> ? Cue<TPayload> : never;

/**
 * 定义用于触发认知处理的线索, Cue 不会自动写入 Engram
 */
export function defineCue<TPayload = unknown>(options: DefineCueOptions): CueDefinition<TPayload> {
  const definition: CueDefinition<TPayload> = {
    ...options,
    type: DefinitionType.Cue,
    id: createId(),
    create(payload, temporal) {
      return {
        type: DataType.Cue,
        definition,
        payload,
        temporal,
      };
    },
  };

  return definition;
}
