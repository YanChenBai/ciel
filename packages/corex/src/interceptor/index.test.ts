import { describe, expect, it, vi } from 'vite-plus/test';

import { createInstrumenter, defineInterceptor } from './index.ts';
import type { AnyFunction } from './index.ts';

describe('interceptor', () => {
  it('定义为 Ciel 模块', () => {
    const interceptor = defineInterceptor({
      name: 'logger',
      description: 'Logs calls',
      intercept() {
        return undefined;
      },
    });

    expect(interceptor).toMatchObject({
      type: 'interceptor',
      name: 'logger',
      description: 'Logs calls',
      id: expect.any(String),
    });
  });

  it('未声明 interceptor 时保持原函数行为', () => {
    const target = vi.fn((value: number) => value * 2);
    const instrument = createInstrumenter([]);
    const instrumented = instrument(target);

    expect(instrumented(3)).toBe(6);
    expect(target).toHaveBeenCalledWith(3);
  });

  it('按模块声明顺序组合匹配的 wrapper', () => {
    const calls: string[] = [];
    const first = defineInterceptor({
      name: 'first',
      description: 'First wrapper',
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
      name: 'skipped',
      description: 'Does not match',
      intercept() {
        return undefined;
      },
    });
    const second = defineInterceptor({
      name: 'second',
      description: 'Second wrapper',
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
    const instrument = createInstrumenter([first, skipped, second]);
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
  });

  it('intercept 返回 undefined 时跳过不匹配的目标函数', () => {
    const calls: string[] = [];
    const interceptor = defineInterceptor({
      name: 'selective',
      description: 'Only observes selected targets',
      intercept<T extends AnyFunction>(target: T) {
        if (target.name !== 'observed') {
          return undefined;
        }

        return next =>
          ((...args: Parameters<T>) => {
            calls.push('interceptor');
            return next(...args);
          }) as T;
      },
    });
    const instrument = createInstrumenter([interceptor]);
    const observed = instrument(function observed() {
      calls.push('observed');
    });
    const ignored = instrument(function ignored() {
      calls.push('ignored');
    });

    observed();
    ignored();

    expect(calls).toEqual(['interceptor', 'observed', 'ignored']);
  });

  it('每个 instrumenter 独立匹配并复用结果', () => {
    const calls: string[] = [];
    let interceptCalls = 0;
    const interceptor = defineInterceptor({
      name: 'logger',
      description: 'Logs calls',
      intercept<T extends AnyFunction>() {
        interceptCalls++;
        return next =>
          ((...args: Parameters<T>) => {
            calls.push('interceptor');
            return next(...args);
          }) as T;
      },
    });
    const instrumented = createInstrumenter([interceptor])(() => calls.push('target'));
    const isolated = createInstrumenter([])(() => calls.push('isolated'));

    instrumented();
    instrumented();
    isolated();

    expect(interceptCalls).toBe(1);
    expect(calls).toEqual(['interceptor', 'target', 'interceptor', 'target', 'isolated']);
  });

  it('保留 target 和 wrapper 的 this 语义', () => {
    const receivers: unknown[] = [];
    const interceptor = defineInterceptor({
      name: 'receiver',
      description: 'Records receivers',
      intercept<T extends AnyFunction>() {
        return next =>
          function (this: ThisParameterType<T>, ...args: Parameters<T>) {
            receivers.push(this);
            return Reflect.apply(next, this, args);
          } as T;
      },
    });
    const instrument = createInstrumenter([interceptor]);
    const calculate = instrument(function (this: { base: number }, delta: number) {
      return this.base + delta;
    });
    const receiver = { base: 2 };

    expect(calculate.call(receiver, 3)).toBe(5);
    expect(receivers).toEqual([receiver]);
  });

  it('保持异步返回值和异常语义', async () => {
    const instrument = createInstrumenter([]);
    const instrumentedAsync = instrument(async () => 42);
    const error = new Error('failed');
    const instrumentedError = instrument(() => {
      throw error;
    });
    let caught: unknown;

    try {
      instrumentedError();
    } catch (currentError) {
      caught = currentError;
    }

    await expect(instrumentedAsync()).resolves.toBe(42);
    expect(caught).toBe(error);
  });
});
