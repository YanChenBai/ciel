import type { AnyFunction, InstrumentContext } from '@ciels/interceptor';

import type { CielPlugin } from '#plugin/types.ts';

import type { Instrument } from './instrumentation.ts';

/**
 * 在顶层为一个 Plugin 创建固定身份的 Instrument。
 */
export function bindPluginInstrument(instrument: Instrument, plugin: CielPlugin): Instrument {
  return function pluginInstrument<T extends AnyFunction>(
    target: T,
    context?: InstrumentContext,
  ): T {
    return instrument(
      target,
      context
        ? {
            ...context,
            metadata: {
              ...context.metadata,
              pluginId: plugin.id,
              pluginName: plugin.name,
            },
          }
        : undefined,
    );
  };
}
