import type { AgentMessage, AgentTool } from '@earendil-works/pi-agent-core';

import type { AnyCue } from '#model/cue/index.ts';
import type { Engram } from '#model/engram/index.ts';
import type { AnySignal } from '#model/signal/index.ts';
import type { PluginOption } from '#plugin/index.ts';

import type { CielAgentOptions } from './agent/index.ts';
import type { LifecycleStatus } from './lifecycle/index.ts';

export type Think = (cue: AnyCue) => Promise<readonly AgentMessage[]>;

export interface DefineCielOptions extends CielAgentOptions {
  /**
   * 长期稳定的 Ciel/资源隔离标识；不传时生成 UUID
   */
  readonly id?: string;
  readonly plugins?: readonly PluginOption[];
  readonly tools?: readonly AgentTool<any>[];
}

export type CielStatus = LifecycleStatus;

export interface Ciel {
  readonly id: string;
  readonly sessionId: string;
  readonly engram: Engram;
  readonly messages: readonly AgentMessage[];
  readonly contextTokens: number;
  readonly status: CielStatus;
  readonly think: Think;
  start(): Promise<void>;
  stop(): Promise<void>;
  dispatchSignal(signal: AnySignal): Promise<void>;
}
