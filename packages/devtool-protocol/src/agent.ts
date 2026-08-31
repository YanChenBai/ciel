import type { SerializedValue } from './value.ts';

export type AgentMessageRole = 'system' | 'user' | 'assistant' | 'tool' | 'custom';

export interface AgentMessageRecord {
  readonly id: string;
  readonly sequence: number;
  readonly role: AgentMessageRole;
  readonly name?: string;
  readonly time?: number;
  readonly content: SerializedValue;
}

export interface AgentSummary {
  readonly messages: number;
  readonly throughSequence: number;
}

export interface AgentMessageQuery {
  readonly after?: number;
  readonly limit?: number;
  readonly role?: AgentMessageRole;
}

export interface AgentMessagePage {
  readonly items: readonly AgentMessageRecord[];
  readonly throughSequence: number;
  readonly next?: number;
}
