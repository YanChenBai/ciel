import type { CielMetadata } from '#shared/metadata.ts';

export const DefinitionType = {
  Signal: 'signal-definition',
  Percept: 'percept-definition',
  Cue: 'cue-definition',
} as const;

export type DefinitionType = (typeof DefinitionType)[keyof typeof DefinitionType];

export interface CielDefinition<
  TType extends DefinitionType = DefinitionType,
> extends CielMetadata {
  /**
   * 定义类型
   */
  readonly type: TType;

  /**
   * 定义的 UUIDv7 唯一标识
   */
  readonly id: string;
}
