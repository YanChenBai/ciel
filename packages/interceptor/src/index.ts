import type {
  AnyFunction,
  Instrument,
  InstrumentContext,
  Interceptor,
  InterceptorWrapper,
} from './types.ts';

export type {
  AnyFunction,
  Instrument,
  InstrumentContext,
  Interceptor,
  InterceptorWrapper,
} from './types.ts';

/**
 * 为一组 interceptor 创建相互隔离的 instrumenter
 */
export function createInstrumenter(interceptors: readonly Interceptor[]): Instrument {
  return function instrument<T extends AnyFunction>(target: T, context?: InstrumentContext): T {
    const wrappers: InterceptorWrapper<T>[] = [];

    for (const interceptor of interceptors) {
      const wrapper = interceptor.intercept(target, context);

      if (wrapper) {
        wrappers.push(wrapper);
      }
    }

    return function (this: ThisParameterType<T>, ...args: Parameters<T>): ReturnType<T> {
      let next = ((...nextArgs: Parameters<T>): ReturnType<T> =>
        Reflect.apply(target, this, nextArgs)) as T;

      for (let index = wrappers.length - 1; index >= 0; index--) {
        next = wrappers[index]!(next);
      }

      return Reflect.apply(next, this, args);
    } as T;
  };
}
