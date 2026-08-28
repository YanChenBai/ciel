import type { CielMetadata } from '#shared/metadata.ts';

export const ModuleType = {
  Stimulus: 'stimulus',
  Sensu: 'sensu',
  Noesis: 'noesis',
  Projection: 'projection',
  Interceptor: 'interceptor',
} as const;

export type ModuleType = (typeof ModuleType)[keyof typeof ModuleType];

export interface CielModule<TType extends ModuleType = ModuleType> extends CielMetadata {
  /**
   * 模块类型
   */
  readonly type: TType;

  /**
   * 模块的 UUIDv7 唯一标识
   */
  readonly id: string;
}
