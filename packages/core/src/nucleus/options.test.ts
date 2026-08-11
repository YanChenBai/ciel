import { describe, expect, it } from 'vite-plus/test';
import { ZodError } from 'zod';

import {
  DEFAULT_CONTEXT_MAX_IMAGES,
  DEFAULT_EPISODIC_MEMORY_LIMIT,
  DEFAULT_EPISODE_IDLE_TIMEOUT,
  DEFAULT_EPISODE_MAX_BUFFERED_IMAGES,
  DEFAULT_EPISODE_MAX_IMAGES,
  DEFAULT_EPISODE_MAX_INPUT_TOKENS,
  DEFAULT_EPISODE_MAX_TEXT_CHARS,
  DEFAULT_EPISODE_MIN_VISUAL_ENTROPY,
  DEFAULT_LONG_TERM_MEMORY_LIMIT,
  DEFAULT_MAX_THINK_INTERVAL,
  DEFAULT_MIN_THINK_INTERVAL,
  DEFAULT_PERCEPT_WINDOW,
} from './constants.ts';
import { normalizeNucleusOptions } from './options.ts';

const requiredOptions = {
  memory: { path: ':memory:' },
  model: {} as never,
};

describe('normalizeNucleusOptions', () => {
  it('补齐调度和记忆窗口默认值', () => {
    const options = normalizeNucleusOptions(requiredOptions);

    expect(options.minThinkInterval).toBe(DEFAULT_MIN_THINK_INTERVAL);
    expect(options.maxThinkInterval).toBe(DEFAULT_MAX_THINK_INTERVAL);
    expect(options.memory.longTermLimit).toBe(DEFAULT_LONG_TERM_MEMORY_LIMIT);
    expect(options.memory.episodicLimit).toBe(DEFAULT_EPISODIC_MEMORY_LIMIT);
    expect(options.memory.episode).toEqual({
      idleTimeout: DEFAULT_EPISODE_IDLE_TIMEOUT,
      maxBufferedImages: DEFAULT_EPISODE_MAX_BUFFERED_IMAGES,
      maxImages: DEFAULT_EPISODE_MAX_IMAGES,
      maxInputTokens: DEFAULT_EPISODE_MAX_INPUT_TOKENS,
      maxTextChars: DEFAULT_EPISODE_MAX_TEXT_CHARS,
      minVisualEntropy: DEFAULT_EPISODE_MIN_VISUAL_ENTROPY,
    });
    expect(options.context.maxImages).toBe(DEFAULT_CONTEXT_MAX_IMAGES);
    expect(options.context.perceptWindow).toBe(DEFAULT_PERCEPT_WINDOW);
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
        memory: { ...requiredOptions.memory, episode: { idleTimeout: 0 } },
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
        memory: { ...requiredOptions.memory, longTermLimit: 1.5 },
      }),
    ).toThrow(ZodError);
    expect(() =>
      normalizeNucleusOptions({
        ...requiredOptions,
        tools: { memory_recall: { inputSchema: {} as never } },
      }),
    ).toThrow('memory tool names are reserved by Nucleus');
  });
});
