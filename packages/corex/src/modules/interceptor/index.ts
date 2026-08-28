import { ModuleType } from '#modules/types.ts';
import { createId } from '#shared/id.ts';

import type {
  AnyFunction,
  DefineInterceptorOptions,
  Instrument,
  Interceptor,
  InterceptorWrapper,
} from './types.ts';

export type {
  AnyFunction,
  DefineInterceptorOptions,
  Instrument,
  Interceptor,
  InterceptorWrapper,
} from './types.ts';

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

/**
 * 为一组 interceptor 模块创建相互隔离的 instrumenter
 */
export function createInstrumenter(interceptors: readonly Interceptor[]): Instrument {
  return function instrument<T extends AnyFunction>(target: T): T {
    const wrappers: InterceptorWrapper<T>[] = [];

    for (const interceptor of interceptors) {
      const wrapper = interceptor.intercept(target);

      if (wrapper) {
        wrappers.push(wrapper);
      }
    }

    return function (this: ThisParameterType<T>, ...args: Parameters<T>): ReturnType<T> {
      // Target continuation 始终使用本次 invocation 的 receiver
      let next = ((...nextArgs: Parameters<T>): ReturnType<T> =>
        Reflect.apply(target, this, nextArgs)) as T;

      // 从后向前组合，使先声明的 wrapper 位于调用链外层
      for (let index = wrappers.length - 1; index >= 0; index--) {
        next = wrappers[index]!(next);
      }

      return Reflect.apply(next, this, args);
    } as T;
  };
}
