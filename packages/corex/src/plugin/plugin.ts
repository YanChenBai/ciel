import { createId } from '#shared/id.ts';

import type { CielPlugin, PluginFactory, PluginOptions } from './types.ts';

/**
 * 定义一个可通过参数配置的 Ciel Plugin 工厂。
 */
export function definePlugin<TOptions>(
  define: (options: TOptions) => PluginOptions,
): PluginFactory<TOptions> {
  return options => {
    const plugin: CielPlugin = {
      ...define(options),
      id: createId(),
    };
    return plugin;
  };
}
