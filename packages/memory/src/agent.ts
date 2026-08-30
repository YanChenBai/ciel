import { randomUUID } from 'node:crypto';

import { runAgentLoop } from '@earendil-works/pi-agent-core';
import type { AgentLoopConfig, AgentMessage } from '@earendil-works/pi-agent-core';
import type { AssistantMessage, Message } from '@earendil-works/pi-ai';
import { streamSimple as defaultStream } from '@earendil-works/pi-ai/compat';

import {
  consolidateLongTermTask,
  type MemoryAgentTask,
  recallTask,
  reviseLongTermTask,
  summarizeDailyTask,
} from './tasks.ts';
import type {
  DailyMemoryEntry,
  LongTermMemoryRevision,
  MemoryAgentOptions,
  MemoryRecall,
} from './types.ts';

function isAssistantMessage(message: AgentMessage): message is AssistantMessage {
  return 'role' in message && message.role === 'assistant';
}

function readAssistantText(messages: readonly AgentMessage[]): string {
  const assistant = messages.findLast(isAssistantMessage);
  if (!assistant) throw new Error('Memory Agent did not return an assistant message');

  if (assistant.stopReason === 'error' || assistant.stopReason === 'aborted') {
    throw new Error(assistant.errorMessage ?? `Memory Agent stopped with ${assistant.stopReason}`);
  }

  const text = assistant.content
    .filter(content => content.type === 'text')
    .map(content => content.text)
    .join('\n')
    .trim();

  if (!text) throw new Error('Memory Agent returned empty content');
  return text;
}

/**
 * 执行隔离的记忆任务 提示词构造与输出解析由 `tasks.ts` 负责，此类只管理 Agent 生命周期与传输
 */
export class MemoryAgent {
  /**
   * 保留执行中的任务，使 `stop()` 能等待它们完成后再关闭
   */
  private readonly pending = new Set<Promise<unknown>>();
  private started = false;

  constructor(private readonly options: MemoryAgentOptions) {}

  start(): void {
    this.started = true;
  }

  async stop(): Promise<void> {
    this.started = false;
    await Promise.allSettled(this.pending);
  }

  summarizeDaily(content: string): Promise<string | undefined> {
    return this.run(summarizeDailyTask(this.options.prompts, content));
  }

  consolidateLongTerm(
    current: LongTermMemoryRevision | undefined,
    date: string,
    entries: readonly DailyMemoryEntry[],
  ): Promise<string | undefined> {
    return this.run(consolidateLongTermTask(this.options.prompts, current, date, entries));
  }

  reviseLongTerm(
    instruction: string,
    current: LongTermMemoryRevision | undefined,
    evidence: readonly DailyMemoryEntry[],
  ): Promise<string | undefined> {
    return this.run(reviseLongTermTask(this.options.prompts, instruction, current, evidence));
  }

  async recall(
    query: string,
    candidates: readonly MemoryRecall[],
    limit: number,
  ): Promise<readonly MemoryRecall[]> {
    if (candidates.length === 0) return [];
    return this.run(recallTask(this.options.prompts, query, candidates, limit));
  }

  private run<TResult>(task: MemoryAgentTask<TResult>): Promise<TResult> {
    if (!this.started) return Promise.reject(new Error('Memory Agent is not running'));

    const execution = this.execute(task.prompt).then(output => task.parse(output));
    this.pending.add(execution);

    void execution.then(
      () => this.pending.delete(execution),
      () => this.pending.delete(execution),
    );

    return execution;
  }

  private async execute(prompt: string): Promise<string> {
    const {
      convertToLlm: customConvertToLlm,
      instructions,
      model,
      onAgentEvent,
      prompts: _prompts,
      stream = defaultStream,
      ...loopOptions
    } = this.options;

    // 每次记忆操作使用全新会话，不继承调用方的对话历史，也不共享任务局部状态
    const loopConfig: AgentLoopConfig = {
      ...loopOptions,
      model,
      sessionId: `memory:${randomUUID()}`,
      convertToLlm: customConvertToLlm ?? (messages => messages as Message[]),
    };

    const messages = await runAgentLoop(
      [{ role: 'user', content: prompt, timestamp: Date.now() }],
      { systemPrompt: instructions, messages: [] },
      loopConfig,
      async event => onAgentEvent?.(event),
      undefined,
      stream,
    );

    return readAssistantText(messages);
  }
}
