export const DefinitionType = {
  Signal: 'signal-definition',
  Percept: 'percept-definition',
  Cue: 'cue-definition',
} as const;

export type DefinitionType = (typeof DefinitionType)[keyof typeof DefinitionType];

export interface CielDefinition<TType extends DefinitionType = DefinitionType> {
  /**
   * 定义类型
   */
  readonly type: TType;

  /**
   * 定义的 UUIDv7 唯一标识
   */
  readonly id: string;

  /**
   * 便于展示和调试的定义名称
   */
  readonly name: string;

  /**
   * 定义的语义和用途说明
   */
  readonly description?: string;
}
