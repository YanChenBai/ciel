import { describe, expect, it, vi } from 'vite-plus/test';

import { defineInterceptor, instrument, useInterceptor } from './index.ts';
import type { AnyFunction } from './types.ts';

describe('interceptor', () => {
  it('未安装拦截器时保持原函数行为', () => {
    const target = vi.fn((value: number) => value * 2);
    const instrumented = instrument(target);

    expect(instrumented(3)).toBe(6);
    expect(target).toHaveBeenCalledWith(3);
  });

  it('按注册顺序组合匹配的包装器', () => {
    const calls: string[] = [];
    const first = defineInterceptor({
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
    const skipped = defineInterceptor({
      intercept() {
        return undefined;
      },
    });
    const second = defineInterceptor({
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
    const disposeFirst = useInterceptor(first);
    const disposeSkipped = useInterceptor(skipped);
    const disposeSecond = useInterceptor(second);

    try {
      const instrumented = instrument(() => {
        calls.push('target');
        return 'result';
      });

      expect(instrumented()).toBe('result');
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

  it('对已经 instrument 的函数动态安装和卸载拦截器', () => {
    const calls: string[] = [];
    const interceptor = defineInterceptor({
      intercept<T extends AnyFunction>() {
        return next =>
          ((...args: Parameters<T>) => {
            calls.push('interceptor');
            return next(...args);
          }) as T;
      },
    });
    const instrumented = instrument(() => calls.push('target'));

    instrumented();
    const dispose = useInterceptor(interceptor);

    try {
      instrumented();
    } finally {
      void dispose();
    }

    instrumented();

    expect(calls).toEqual(['target', 'interceptor', 'target', 'target']);
  });

  it('重复安装同一个定义时等待全部注销后再移除', () => {
    const calls: string[] = [];
    const interceptor = defineInterceptor({
      intercept<T extends AnyFunction>() {
        return next =>
          ((...args: Parameters<T>) => {
            calls.push('interceptor');
            return next(...args);
          }) as T;
      },
    });
    const instrumented = instrument(() => calls.push('target'));
    const disposeFirst = useInterceptor(interceptor);
    const disposeSecond = useInterceptor(interceptor);

    instrumented();
    void disposeFirst();
    instrumented();
    void disposeSecond();
    instrumented();

    expect(calls).toEqual(['interceptor', 'target', 'interceptor', 'target', 'target']);
  });

  it('只在 registry 变化后重新执行拦截判断', () => {
    let interceptCalls = 0;
    const interceptor = defineInterceptor({
      intercept<T extends AnyFunction>() {
        interceptCalls++;
        return (next: T): T => next;
      },
    });
    const instrumented = instrument((value: number) => value);
    const dispose = useInterceptor(interceptor);

    try {
      expect(instrumented(1)).toBe(1);
      expect(instrumented(2)).toBe(2);
      expect(interceptCalls).toBe(1);
    } finally {
      void dispose();
    }
  });

  it('保留原函数的 this 语义', () => {
    const interceptor = defineInterceptor({
      intercept<T extends AnyFunction>() {
        return next => ((...args: Parameters<T>) => next(...args)) as T;
      },
    });
    const dispose = useInterceptor(interceptor);
    const calculate = instrument(function (this: { base: number }, delta: number) {
      return this.base + delta;
    });

    try {
      expect(calculate.call({ base: 2 }, 3)).toBe(5);
    } finally {
      void dispose();
    }
  });

  it('保持异步返回值和异常语义', async () => {
    const instrumentedAsync = instrument(async () => 42);
    const error = new Error('failed');
    const instrumentedError = instrument(() => {
      throw error;
    });

    await expect(instrumentedAsync()).resolves.toBe(42);
    expect(() => instrumentedError()).toThrow(error);
  });
});
