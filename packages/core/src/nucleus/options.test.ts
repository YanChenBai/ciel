import { describe, expect, it } from 'vite-plus/test';
import { ZodError } from 'zod';

import type { Memory } from '#memory';

import {
  DEFAULT_CONTEXT_MAX_IMAGES,
  DEFAULT_MAX_THINK_INTERVAL,
  DEFAULT_MEMORY_SUMMARY_IDLE_TIMEOUT,
  DEFAULT_MEMORY_SUMMARY_MAX_INTERVAL,
  DEFAULT_MEMORY_SUMMARY_MAX_TOKENS,
  DEFAULT_MIN_THINK_INTERVAL,
  DEFAULT_PERCEPT_WINDOW,
} from './constants.ts';
import { normalizeNucleusOptions } from './options.ts';

const requiredOptions = {
  memory: {} as Memory,
  model: {} as never,
};

describe('normalizeNucleusOptions', () => {
  it('补齐调度、上下文和记忆总结默认值', () => {
    const options = normalizeNucleusOptions(requiredOptions);

    expect(options.minThinkInterval).toBe(DEFAULT_MIN_THINK_INTERVAL);
    expect(options.maxThinkInterval).toBe(DEFAULT_MAX_THINK_INTERVAL);
    expect(options.context.maxImages).toBe(DEFAULT_CONTEXT_MAX_IMAGES);
    expect(options.context.perceptWindow).toBe(DEFAULT_PERCEPT_WINDOW);
    expect(options.memorySummary).toEqual({
      idleTimeout: DEFAULT_MEMORY_SUMMARY_IDLE_TIMEOUT,
      maxInterval: DEFAULT_MEMORY_SUMMARY_MAX_INTERVAL,
      maxTokens: DEFAULT_MEMORY_SUMMARY_MAX_TOKENS,
    });
  });

  it('使用 Zod 校验范围和跨字段约束', () => {
    expect(() => normalizeNucleusOptions({ ...requiredOptions, minThinkInterval: 0 })).toThrow(
      ZodError,
    );
    expect(() =>
      normalizeNucleusOptions({
        ...requiredOptions,
        maxThinkInterval: 1,
        minThinkInterval: 2,
      }),
    ).toThrow(ZodError);
    expect(() =>
      normalizeNucleusOptions({
        ...requiredOptions,
        memorySummary: { idleTimeout: 0 },
      }),
    ).toThrow(ZodError);
    expect(() =>
      normalizeNucleusOptions({
        ...requiredOptions,
        context: { perceptWindow: 0 },
      }),
    ).toThrow(ZodError);
    expect(() =>
      normalizeNucleusOptions({
        ...requiredOptions,
        tools: { memory_update: { inputSchema: {} as never } },
      }),
    ).toThrow('memory tool names are reserved by Nucleus');
  });
});
