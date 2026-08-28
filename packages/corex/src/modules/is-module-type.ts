import type { CielModule, ModuleType } from '#modules/types.ts';

/**
 * 根据模块类型收窄 Ciel 模块联合
 */
export function isModuleType<TModule extends CielModule, TType extends ModuleType>(
  module: TModule,
  type: TType,
): module is Extract<TModule, { readonly type: TType }> {
  return module.type === type;
}
