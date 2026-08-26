import type { Dispose } from '../types/index.ts';
import type { AnyFunction, ObserveDefinition, ObserveWrapper } from './types.ts';

export type * from './types.ts';

const definitions = new Map<ObserveDefinition, number>();

// Registry 变化后递增版本,让已有包装函数按需刷新匹配结果
let version = 0;

/**
 * 定义观测拦截器,并保留传入对象的精确类型
 */
export function defineObserve<T extends ObserveDefinition>(definition: T): T {
  return definition;
}

/**
 * 安装观测定义,返回对应的卸载函数
 */
export function useObserve(definition: ObserveDefinition): Dispose {
  const references = definitions.get(definition) ?? 0;

  definitions.set(definition, references + 1);

  if (references === 0) {
    version++;
  }

  let active = true;

  return () => {
    if (!active) {
      return;
    }

    active = false;

    const currentReferences = definitions.get(definition);

    if (currentReferences === 1) {
      definitions.delete(definition);
      version++;
    } else if (currentReferences) {
      definitions.set(definition, currentReferences - 1);
    }
  };
}

/**
 * 包装目标函数,并在调用时应用当前已安装的观测定义
 */
export function observe<T extends AnyFunction>(target: T): T {
  let cachedVersion = -1;
  let wrappers: ObserveWrapper<T>[] = [];

  const update = (): void => {
    if (cachedVersion === version) {
      return;
    }

    wrappers = [];

    for (const definition of definitions.keys()) {
      const wrapper = definition.intercept(target);

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
