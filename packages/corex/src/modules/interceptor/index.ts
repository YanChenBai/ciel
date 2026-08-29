import { ModuleType } from '#modules/types.ts';
import { createId } from '#shared/id.ts';

import type { DefineInterceptorOptions, Interceptor } from './types.ts';

export { createInstrumenter } from '@ciels/interceptor';
export type {
  AnyFunction,
  Instrument,
  InstrumentContext,
  InterceptorWrapper,
} from '@ciels/interceptor';
export type { DefineInterceptorOptions, Interceptor } from './types.ts';

/**
 * 定义拦截器模块
 */
export function defineInterceptor(options: DefineInterceptorOptions): Interceptor {
  return {
    ...options,
    type: ModuleType.Interceptor,
    id: createId(),
  };
}
