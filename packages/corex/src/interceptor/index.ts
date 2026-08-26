import type { Dispose } from '../types/index.ts';
import type { AnyFunction, Interceptor, InterceptorWrapper } from './types.ts';

export type * from './types.ts';

const interceptors = new Map<Interceptor, number>();

// Registry 变化后递增版本,让已有包装函数按需刷新匹配结果
let version = 0;

/**
 * 定义拦截器,并保留传入对象的精确类型
 */
export function defineInterceptor<T extends Interceptor>(interceptor: T): T {
  return interceptor;
}

/**
 * 安装拦截器,返回对应的卸载函数
 */
export function useInterceptor(interceptor: Interceptor): Dispose {
  const references = interceptors.get(interceptor) ?? 0;

  interceptors.set(interceptor, references + 1);

  if (references === 0) {
    version++;
  }

  let active = true;

  return () => {
    if (!active) {
      return;
    }

    active = false;

    const currentReferences = interceptors.get(interceptor);

    if (currentReferences === 1) {
      interceptors.delete(interceptor);
      version++;
    } else if (currentReferences) {
      interceptors.set(interceptor, currentReferences - 1);
    }
  };
}

/**
 * 将目标函数接入拦截器,并在调用时应用当前已安装的拦截器
 */
export function instrument<T extends AnyFunction>(target: T): T {
  let cachedVersion = -1;
  let wrappers: InterceptorWrapper<T>[] = [];

  const update = (): void => {
    if (cachedVersion === version) {
      return;
    }

    wrappers = [];

    for (const interceptor of interceptors.keys()) {
      const wrapper = interceptor.intercept(target);

      if (wrapper) {
        wrappers.push(wrapper);
      }
    }

    cachedVersion = version;
  };

  return function (this: unknown, ...args: Parameters<T>): ReturnType<T> {
    update();

    // 捕获本次调用的 this,拦截器只需通过 next 进入下一层
    let next = ((...nextArgs: Parameters<T>): ReturnType<T> =>
      Reflect.apply(target, this, nextArgs)) as T;

    // 从后向前组合,使先注册的 wrapper 位于调用链外层
    for (let index = wrappers.length - 1; index >= 0; index--) {
      next = wrappers[index]!(next);
    }

    return next(...args);
  } as T;
}
