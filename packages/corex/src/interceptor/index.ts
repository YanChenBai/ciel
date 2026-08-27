import { ModuleType } from '../types/index.ts';
import type { CielModule } from '../types/index.ts';
import { createId } from '../utils/index.ts';

export type AnyFunction = (...args: any[]) => any;

/**
 * 包装下一层函数,返回调用签名不变的新函数
 */
export type InterceptorWrapper<T extends AnyFunction = AnyFunction> = (next: T) => T;

export interface DefineInterceptorOptions {
  readonly name: string;

  readonly description?: string;

  /**
   * 判断是否拦截目标函数,未命中时返回 undefined
   */
  intercept<T extends AnyFunction>(target: T): InterceptorWrapper<T> | undefined;
}

export interface Interceptor extends DefineInterceptorOptions, CielModule<'interceptor'> {}

export type Instrument = <T extends AnyFunction>(target: T) => T;

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
