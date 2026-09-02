import type { Interceptor } from '@cieljs/instrument';
import type { AgentTool } from '@earendil-works/pi-agent-core';
import type { Model } from '@earendil-works/pi-ai';

import type { AgentConfig, AgentSessionStore } from '#runtime/agent/index.ts';
import type { Ciel } from '#runtime/types.ts';
import type { MaybePromise } from '#shared/async.ts';
import type { CielMetadata } from '#shared/metadata.ts';

import type { Projector } from './projector.ts';
import type { Sensu } from './sensu.ts';

export interface ResolvedCielConfig {
  readonly id: string;
  readonly sessionId: string;
  readonly model: Model<any>;
  readonly instructions: string;
  readonly plugins: readonly CielPlugin[];
  readonly tools: readonly AgentTool<any>[];
  readonly agent: AgentConfig;
  readonly sessionStore?: AgentSessionStore;
}

export interface PluginRuntimeContext {
  readonly ciel: Ciel;
}

export interface CielPlugin extends CielMetadata {
  readonly id: string;
  readonly instructions?: string;
  readonly interceptors?: readonly Interceptor[];
  readonly projectors?: readonly Projector[];
  readonly sensu?: readonly Sensu[];
  readonly tools?: readonly AgentTool<any>[];
  configResolved?(config: Readonly<ResolvedCielConfig>): MaybePromise<void>;
  initialize?(): MaybePromise<void>;
  activate?(context: PluginRuntimeContext): MaybePromise<void>;
  deactivate?(): MaybePromise<void>;
  dispose?(): MaybePromise<void>;
}

export type PluginOption = CielPlugin | false | null | undefined | readonly PluginOption[];
export type PluginFactory<TOptions> = (options: TOptions) => CielPlugin;
export type EmptyPluginFactory = () => CielPlugin;
