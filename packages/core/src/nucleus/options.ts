import type { ToolSet } from 'ai';
import { z } from 'zod';

import {
  DEFAULT_CONTEXT_MAX_IMAGES,
  DEFAULT_MAX_THINK_INTERVAL,
  DEFAULT_MEMORY_SUMMARY_IDLE_TIMEOUT,
  DEFAULT_MEMORY_SUMMARY_MAX_INTERVAL,
  DEFAULT_MEMORY_SUMMARY_MAX_TOKENS,
  DEFAULT_MIN_THINK_INTERVAL,
  DEFAULT_PERCEPT_WINDOW,
} from './constants.ts';
import type { NucleusOptions } from './types.ts';

const RESERVED_TOOL_NAMES = ['memory_recall', 'memory_update'] as const;

export type NormalizedNucleusOptions<TOutput> = Omit<
  NucleusOptions<TOutput>,
  'context' | 'maxThinkInterval' | 'memorySummary' | 'minThinkInterval'
> & {
  context: {
    maxImages: number;
    perceptWindow: number;
  };
  maxThinkInterval: number;
  memorySummary: {
    idleTimeout: number;
    maxInterval: number;
    maxTokens: number;
  };
  minThinkInterval: number;
};

const nucleusOptionsSchema = z
  .object({
    contextMaxImages: z.int().nonnegative().default(DEFAULT_CONTEXT_MAX_IMAGES),
    maxThinkInterval: z.number().positive().finite().default(DEFAULT_MAX_THINK_INTERVAL),
    memorySummaryIdleTimeout: z
      .number()
      .positive()
      .finite()
      .default(DEFAULT_MEMORY_SUMMARY_IDLE_TIMEOUT),
    memorySummaryMaxInterval: z
      .number()
      .positive()
      .finite()
      .default(DEFAULT_MEMORY_SUMMARY_MAX_INTERVAL),
    memorySummaryMaxTokens: z.int().positive().default(DEFAULT_MEMORY_SUMMARY_MAX_TOKENS),
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

export function normalizeNucleusOptions<TOutput>(
  options: NucleusOptions<TOutput>,
): NormalizedNucleusOptions<TOutput> {
  const normalized = nucleusOptionsSchema.parse({
    contextMaxImages: options.context?.maxImages,
    maxThinkInterval: options.maxThinkInterval,
    memorySummaryIdleTimeout: options.memorySummary?.idleTimeout,
    memorySummaryMaxInterval: options.memorySummary?.maxInterval,
    memorySummaryMaxTokens: options.memorySummary?.maxTokens,
    minThinkInterval: options.minThinkInterval,
    perceptWindow: options.context?.perceptWindow,
    tools: options.tools,
  });

  return {
    ...options,
    ...normalized,
    context: {
      maxImages: normalized.contextMaxImages,
      perceptWindow: normalized.perceptWindow,
    },
    memorySummary: {
      idleTimeout: normalized.memorySummaryIdleTimeout,
      maxInterval: normalized.memorySummaryMaxInterval,
      maxTokens: normalized.memorySummaryMaxTokens,
    },
  };
}
