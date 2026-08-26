export const ModuleType = {
  Stimulus: 'stimulus',
  Sensu: 'sensu',
  Noesis: 'noesis',
} as const;

export type ModuleType = (typeof ModuleType)[keyof typeof ModuleType];

export interface CielModule<TType extends ModuleType = ModuleType> {
  /**
   * 模块类型
   */
  readonly type: TType;

  /**
   * 模块的 UUIDv7 唯一标识
   */
  readonly id: string;

  /**
   * 便于展示和调试的模块名称
   */
  readonly name: string;

  /**
   * 模块职责和用途的说明
   */
  readonly description: string;
}
