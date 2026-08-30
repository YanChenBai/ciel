import type {
  AgentEvent,
  AgentLoopConfig,
  AgentMessage,
  StreamFn,
} from '@earendil-works/pi-agent-core';
import type { Message, Model } from '@earendil-works/pi-ai';

import type { AnyCue } from '#model/cue/index.ts';
import type { EngramCheckout, EngramEntry, EngramView } from '#model/engram/index.ts';
import type { LLMContext } from '#model/llm/index.ts';
import type { MaybePromise } from '#shared/async.ts';

export interface AgentFrame {
  readonly cue: AnyCue;
  readonly checkout: EngramCheckout;
  /**
   * 本轮开始时的最近 Engram 快照。
   */
  readonly engram: EngramView;
  /**
   * 本轮尚未被 Agent 成功消费的增量条目。
   */
  readonly delta: readonly EngramEntry[];
  readonly context: AgentContext;
}

export type AgentContext = Readonly<Record<string, LLMContext>>;

export type AgentContextBuilder = (entries: readonly EngramEntry[]) => Promise<AgentContext>;

export type AgentPrompt = (
  frame: AgentFrame,
) => MaybePromise<AgentMessage | readonly AgentMessage[]>;

export type AgentEventHandler = (event: AgentEvent) => MaybePromise<void>;

export type AgentMessageConverter = (messages: AgentMessage[]) => MaybePromise<Message[]>;

export interface AgentSessionAddress {
  readonly cielId: string;
  readonly sessionId: string;
}

export interface AgentSessionStore {
  load(address: AgentSessionAddress): Promise<readonly AgentMessage[]>;
  append(address: AgentSessionAddress, messages: readonly AgentMessage[]): Promise<void>;
}

export interface CreateAgentSessionStoreOptions {
  /**
   * 默认 `.ciel`。
   */
  readonly path?: string;
  readonly cwd?: string;
}

export interface CielAgentOptions extends Omit<
  AgentLoopConfig,
  'convertToLlm' | 'model' | 'sessionId'
> {
  readonly instructions: string;
  readonly model: Model<any>;
  /**
   * 不传时由 defineCiel 为本次运行生成。传入日期即可按天恢复会话。
   */
  readonly sessionId?: string;
  /**
   * 默认使用 `.ciel` 下的 Pi JSONL Session；传 `false` 禁用持久化。
   */
  readonly sessionStore?: AgentSessionStore | false;
  readonly stream?: StreamFn;
  readonly prompt?: AgentPrompt;
  readonly onAgentEvent?: AgentEventHandler;
  readonly convertToLlm?: AgentMessageConverter;
}

/**
 * 可由内部子 Agent 继承的主 Agent 配置。
 */
export type AgentConfig = Omit<
  CielAgentOptions,
  'instructions' | 'prompt' | 'sessionId' | 'sessionStore'
>;

export type AgentRuntimeStatus = 'idle' | 'running' | 'stopping';

export interface AgentRuntime {
  readonly status: AgentRuntimeStatus;
  readonly messages: readonly AgentMessage[];
  readonly start: () => Promise<void>;
  readonly think: (cue: AnyCue) => Promise<readonly AgentMessage[]>;
  readonly stop: () => Promise<void>;
}
