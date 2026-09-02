import {
  calculateContextTokens,
  createCompactionSummaryMessage,
  serializeConversation,
  type AgentMessage,
  type AgentTool,
  type StreamFn,
} from '@earendil-works/pi-agent-core';
import { contentText, type Context, type Model } from '@earendil-works/pi-ai';

import type {
  AgentCompactionOptions,
  AgentContextTokenCounter,
  AgentMessageConverter,
} from './types.ts';

const DEFAULT_COMPACTION_RATIO = 0.8;
const DEFAULT_KEEP_RECENT_TURNS = 1;
const DEFAULT_SUMMARY_MAX_TOKENS = 4_096;
const SUMMARIZATION_SYSTEM_PROMPT =
  '你是上下文压缩助手。请为将继续对话的另一个助手生成简洁摘要，保留目标、约束、关键决策、进度、未解决问题和准确标识。不要继续对话，只输出摘要。';

export interface ResolvedCompactionOptions {
  readonly thresholdTokens: number;
  readonly keepRecentTurns: number;
  readonly summaryMaxTokens: number;
  readonly instructions: string | undefined;
  readonly countTokens: AgentContextTokenCounter | undefined;
}

interface ContextTokenInput {
  readonly convertToLlm: AgentMessageConverter;
  readonly fallbackTokens: number;
  readonly instructions: string;
  readonly messages: readonly AgentMessage[];
  readonly model: Model<any>;
  readonly options: ResolvedCompactionOptions;
  readonly tools: readonly AgentTool<any>[] | undefined;
}

interface CompactContextInput extends ContextTokenInput {
  readonly force?: boolean;
  readonly pendingMessages: readonly AgentMessage[];
  readonly stream: StreamFn;
}

export interface CompactedContext {
  readonly messages: AgentMessage[];
  readonly tokens: number;
  readonly compacted: boolean;
}

function positiveInteger(value: number, name: string): number {
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new TypeError(`${name} must be a positive integer`);
  }

  return value;
}

function nonNegativeInteger(value: number, name: string): number {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new TypeError(`${name} must be a non-negative integer`);
  }

  return value;
}

export function resolveCompactionOptions(
  value: AgentCompactionOptions | false | undefined,
  model: Model<any>,
): ResolvedCompactionOptions | undefined {
  if (value === false) return undefined;

  const thresholdTokens = positiveInteger(
    value?.thresholdTokens ?? Math.floor(model.contextWindow * DEFAULT_COMPACTION_RATIO),
    'compaction.thresholdTokens',
  );
  const keepRecentTurns = nonNegativeInteger(
    value?.keepRecentTurns ?? DEFAULT_KEEP_RECENT_TURNS,
    'compaction.keepRecentTurns',
  );
  const summaryMaxTokens = positiveInteger(
    value?.summaryMaxTokens ??
      Math.min(
        DEFAULT_SUMMARY_MAX_TOKENS,
        model.maxTokens > 0 ? model.maxTokens : DEFAULT_SUMMARY_MAX_TOKENS,
      ),
    'compaction.summaryMaxTokens',
  );

  return {
    thresholdTokens,
    keepRecentTurns,
    summaryMaxTokens,
    instructions: value?.instructions?.trim() || undefined,
    countTokens: value?.countTokens,
  };
}

export function readLastContextTokens(messages: readonly AgentMessage[]): number | undefined {
  let latestPrefixTimestamp = Number.NEGATIVE_INFINITY;
  let tokens: number | undefined;

  for (const message of messages) {
    if (
      message.role === 'assistant' &&
      message.timestamp >= latestPrefixTimestamp &&
      message.stopReason !== 'error' &&
      message.stopReason !== 'aborted'
    ) {
      const current = calculateContextTokens(message.usage);
      if (current > 0) tokens = current;
    }
    latestPrefixTimestamp = Math.max(latestPrefixTimestamp, message.timestamp);
  }

  return tokens;
}

async function createLlmContext(input: ContextTokenInput): Promise<Context> {
  return {
    systemPrompt: input.instructions,
    messages: await input.convertToLlm([...input.messages]),
    tools: input.tools ? [...input.tools] : undefined,
  };
}

export async function countContextTokens(input: ContextTokenInput): Promise<number> {
  if (!input.options.countTokens) {
    return readLastContextTokens(input.messages) ?? input.fallbackTokens;
  }

  const tokens = await input.options.countTokens({
    context: await createLlmContext(input),
    model: input.model,
  });

  return nonNegativeInteger(tokens, 'compaction.countTokens result');
}

function findRetainedStart(messages: readonly AgentMessage[], keepRecentTurns: number): number {
  if (keepRecentTurns === 0) return messages.length;

  let turns = 0;
  for (let index = messages.length - 1; index >= 0; index--) {
    if (messages[index]?.role !== 'user') continue;
    turns++;
    if (turns === keepRecentTurns) return index;
  }

  return 0;
}

async function generateSummary(input: CompactContextInput, messages: readonly AgentMessage[]) {
  const converted = await input.convertToLlm([...messages]);
  const conversation = serializeConversation(converted);
  const focus = input.options.instructions
    ? `\n\n额外关注事项：\n${input.options.instructions}`
    : '';
  const response = await input.stream(
    input.model,
    {
      systemPrompt: SUMMARIZATION_SYSTEM_PROMPT,
      messages: [
        {
          role: 'user',
          content: `请为以下对话生成简洁的续接摘要：\n\n<conversation>\n${conversation}\n</conversation>${focus}`,
          timestamp: Date.now(),
        },
      ],
    },
    {
      cacheRetention: 'none',
      maxTokens: input.options.summaryMaxTokens,
    },
  );

  for await (const _event of response) {
    // 消费完整事件流后再读取最终摘要
  }

  const result = await response.result();
  if (result.stopReason === 'error' || result.stopReason === 'aborted') {
    throw new Error(result.errorMessage ?? `Context compaction stopped with ${result.stopReason}`);
  }

  const summary = contentText(result.content).trim();
  if (!summary) throw new Error('Context compaction returned an empty summary');

  return summary;
}

export async function compactProjectedContext(
  input: CompactContextInput,
): Promise<CompactedContext> {
  const projectedMessages = [...input.messages, ...input.pendingMessages];
  const tokens = await countContextTokens({ ...input, messages: projectedMessages });
  if (!input.force && tokens < input.options.thresholdTokens) {
    return { messages: [...input.messages], tokens, compacted: false };
  }

  const retainedStart = findRetainedStart(input.messages, input.options.keepRecentTurns);
  if (retainedStart <= 0) {
    return { messages: [...input.messages], tokens, compacted: false };
  }

  const summary = await generateSummary(input, input.messages.slice(0, retainedStart));
  const messages = [
    createCompactionSummaryMessage(summary, tokens, Date.now()),
    ...input.messages.slice(retainedStart),
  ];
  const compactedTokens = await countContextTokens({
    ...input,
    fallbackTokens: tokens,
    messages: [...messages, ...input.pendingMessages],
  });

  return { messages, tokens: compactedTokens, compacted: true };
}
