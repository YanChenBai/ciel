import { v7 as uuidv7 } from 'uuid';

import type { CielModule, ModuleType } from '../types/index.ts';

export const createId = () => uuidv7();

/**
 * 根据模块类型收窄 Ciel 模块联合
 */
export function isModuleType<TModule extends CielModule, TType extends ModuleType>(
  module: TModule,
  type: TType,
): module is Extract<TModule, { readonly type: TType }> {
  return module.type === type;
}
