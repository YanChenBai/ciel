import { describe, expect, it, vi } from 'vite-plus/test';

import { defineObserve, observe, useObserve } from './index.ts';
import type { AnyFunction } from './types.ts';

describe('observe', () => {
  it('未安装观测定义时保持原函数行为', () => {
    const target = vi.fn((value: number) => value * 2);
    const observed = observe(target);

    expect(observed(3)).toBe(6);
    expect(target).toHaveBeenCalledWith(3);
  });

  it('按注册顺序组合匹配的包装器', () => {
    const calls: string[] = [];
    const first = defineObserve({
      intercept<T extends AnyFunction>() {
        return next =>
          ((...args: Parameters<T>) => {
            calls.push('first:before');
            const result = next(...args);
            calls.push('first:after');
            return result;
          }) as T;
      },
    });
    const skipped = defineObserve({
      intercept() {
        return undefined;
      },
    });
    const second = defineObserve({
      intercept<T extends AnyFunction>() {
        return next =>
          ((...args: Parameters<T>) => {
            calls.push('second:before');
            const result = next(...args);
            calls.push('second:after');
            return result;
          }) as T;
      },
    });
    const disposeFirst = useObserve(first);
    const disposeSkipped = useObserve(skipped);
    const disposeSecond = useObserve(second);

    try {
      const observed = observe(() => {
        calls.push('target');
        return 'result';
      });

      expect(observed()).toBe('result');
      expect(calls).toEqual([
        'first:before',
        'second:before',
        'target',
        'second:after',
        'first:after',
      ]);
    } finally {
      void disposeSecond();
      void disposeSkipped();
      void disposeFirst();
    }
  });

  it('对已经 observe 的函数动态安装和卸载定义', () => {
    const calls: string[] = [];
    const definition = defineObserve({
      intercept<T extends AnyFunction>() {
        return next =>
          ((...args: Parameters<T>) => {
            calls.push('observe');
            return next(...args);
          }) as T;
      },
    });
    const observed = observe(() => calls.push('target'));

    observed();
    const dispose = useObserve(definition);

    try {
      observed();
    } finally {
      void dispose();
    }

    observed();

    expect(calls).toEqual(['target', 'observe', 'target', 'target']);
  });

  it('重复安装同一个定义时等待全部注销后再移除', () => {
    const calls: string[] = [];
    const definition = defineObserve({
      intercept<T extends AnyFunction>() {
        return next =>
          ((...args: Parameters<T>) => {
            calls.push('observe');
            return next(...args);
          }) as T;
      },
    });
    const observed = observe(() => calls.push('target'));
    const disposeFirst = useObserve(definition);
    const disposeSecond = useObserve(definition);

    observed();
    void disposeFirst();
    observed();
    void disposeSecond();
    observed();

    expect(calls).toEqual(['observe', 'target', 'observe', 'target', 'target']);
  });

  it('只在 registry 变化后重新执行拦截判断', () => {
    let interceptCalls = 0;
    const definition = defineObserve({
      intercept<T extends AnyFunction>() {
        interceptCalls++;
        return (next: T): T => next;
      },
    });
    const observed = observe((value: number) => value);
    const dispose = useObserve(definition);

    try {
      expect(observed(1)).toBe(1);
      expect(observed(2)).toBe(2);
      expect(interceptCalls).toBe(1);
    } finally {
      void dispose();
    }
  });

  it('保留原函数的 this 语义', () => {
    const definition = defineObserve({
      intercept<T extends AnyFunction>() {
        return next => ((...args: Parameters<T>) => next(...args)) as T;
      },
    });
    const dispose = useObserve(definition);
    const calculate = observe(function (this: { base: number }, delta: number) {
      return this.base + delta;
    });

    try {
      expect(calculate.call({ base: 2 }, 3)).toBe(5);
    } finally {
      void dispose();
    }
  });

  it('保持异步返回值和异常语义', async () => {
    const observedAsync = observe(async () => 42);
    const error = new Error('failed');
    const observedError = observe(() => {
      throw error;
    });

    await expect(observedAsync()).resolves.toBe(42);
    expect(() => observedError()).toThrow(error);
  });
});
