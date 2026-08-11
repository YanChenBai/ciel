import type { ToolSet } from 'ai';
import { z } from 'zod';

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
import type { NucleusMemoryOptions, NucleusOptions } from './types.ts';

const RESERVED_TOOL_NAMES = ['memory_recall', 'memory_remember'] as const;

type NormalizedMemoryOptions = NucleusMemoryOptions & {
  episodicLimit: number;
  episode: Required<NonNullable<NucleusMemoryOptions['episode']>>;
  longTermLimit: number;
};

export type NormalizedNucleusOptions<TOutput> = Omit<
  NucleusOptions<TOutput>,
  'context' | 'maxThinkInterval' | 'memory' | 'minThinkInterval'
> & {
  context: {
    definitions: readonly import('./types.ts').ContextDefinitionInput[];
    maxImages: number;
    perceptWindow: number;
  };
  maxThinkInterval: number;
  memory: NormalizedMemoryOptions;
  minThinkInterval: number;
};

const nucleusOptionsSchema = z
  .object({
    episodicLimit: z.int().nonnegative().default(DEFAULT_EPISODIC_MEMORY_LIMIT),
    contextMaxImages: z.int().nonnegative().default(DEFAULT_CONTEXT_MAX_IMAGES),
    episodeIdleTimeout: z.number().positive().finite().default(DEFAULT_EPISODE_IDLE_TIMEOUT),
    episodeMaxBufferedImages: z.int().positive().default(DEFAULT_EPISODE_MAX_BUFFERED_IMAGES),
    episodeMaxImages: z.int().nonnegative().default(DEFAULT_EPISODE_MAX_IMAGES),
    episodeMaxInputTokens: z.int().positive().default(DEFAULT_EPISODE_MAX_INPUT_TOKENS),
    episodeMaxTextChars: z.int().positive().default(DEFAULT_EPISODE_MAX_TEXT_CHARS),
    episodeMinVisualEntropy: z
      .number()
      .nonnegative()
      .finite()
      .default(DEFAULT_EPISODE_MIN_VISUAL_ENTROPY),
    longTermLimit: z.int().nonnegative().default(DEFAULT_LONG_TERM_MEMORY_LIMIT),
    maxThinkInterval: z.number().positive().finite().default(DEFAULT_MAX_THINK_INTERVAL),
    minThinkInterval: z.number().positive().finite().default(DEFAULT_MIN_THINK_INTERVAL),
    perceptWindow: z.number().positive().finite().default(DEFAULT_PERCEPT_WINDOW),
    tools: z
      .custom<ToolSet>(value => typeof value === 'object' && value !== null)
      .optional()
      .refine(
        tools => !tools || RESERVED_TOOL_NAMES.every(name => !(name in tools)),
        'memory tool names are reserved by Nucleus',
      ),
  })
  .refine(options => options.maxThinkInterval >= options.minThinkInterval, {
    message: 'maxThinkInterval must be greater than or equal to minThinkInterval',
    path: ['maxThinkInterval'],
  });

/**
 * 校验 Nucleus 调度参数并补齐全部默认值。
 */
export function normalizeNucleusOptions<TOutput>(
  options: NucleusOptions<TOutput>,
): NormalizedNucleusOptions<TOutput> {
  const normalized = nucleusOptionsSchema.parse({
    contextMaxImages: options.context?.maxImages,
    episodicLimit: options.memory.episodicLimit,
    episodeIdleTimeout: options.memory.episode?.idleTimeout,
    episodeMaxBufferedImages: options.memory.episode?.maxBufferedImages,
    episodeMaxImages: options.memory.episode?.maxImages,
    episodeMaxInputTokens: options.memory.episode?.maxInputTokens,
    episodeMaxTextChars: options.memory.episode?.maxTextChars,
    episodeMinVisualEntropy: options.memory.episode?.minVisualEntropy,
    longTermLimit: options.memory.longTermLimit,
    maxThinkInterval: options.maxThinkInterval,
    minThinkInterval: options.minThinkInterval,
    perceptWindow: options.context?.perceptWindow,
    tools: options.tools,
  });

  return {
    ...options,
    ...normalized,
    context: {
      definitions: options.context?.definitions ?? [],
      maxImages: normalized.contextMaxImages,
      perceptWindow: normalized.perceptWindow,
    },
    memory: {
      ...options.memory,
      episodicLimit: normalized.episodicLimit,
      episode: {
        idleTimeout: normalized.episodeIdleTimeout,
        maxBufferedImages: normalized.episodeMaxBufferedImages,
        maxImages: normalized.episodeMaxImages,
        maxInputTokens: normalized.episodeMaxInputTokens,
        maxTextChars: normalized.episodeMaxTextChars,
        minVisualEntropy: normalized.episodeMinVisualEntropy,
      },
      longTermLimit: normalized.longTermLimit,
    },
  };
}
