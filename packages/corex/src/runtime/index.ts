import { randomUUID } from 'node:crypto';

import { createEngram } from '#model/engram/index.ts';

import { createAgentRuntime } from './agent/runtime.ts';
import { createAgentSessionStore } from './agent/session.ts';
import type { AgentConfig } from './agent/types.ts';
import { createSignalBus } from './event-bus/index.ts';
import { CielOperationName, createInstrumenter } from './instrumentation.ts';
import {
  createLifecycle,
  createLifecycleScope,
  disposeScopes,
  type LifecycleScope,
} from './lifecycle/index.ts';
import {
  collectPlugins,
  installSensu,
  resolvePluginContributions,
  resolvePlugins,
  startPlugins,
  type RuntimeServices,
} from './plugins.ts';
import { createProjectorRunner } from './projector.ts';
import type { Ciel, DefineCielOptions } from './types.ts';

export type {
  Ciel,
  CielStatus,
  DefineCielOptions,
  InstallableCielPlugin,
  InstallableCielPluginEntry,
  Think,
} from './types.ts';
export { CielOperationName };
export type {
  AgentConfig,
  AgentEventHandler,
  AgentFrame,
  AgentMessage,
  AgentMessageConverter,
  AgentPrompt,
  AgentContext,
  AgentContextBuilder,
  AgentRuntimeStatus,
  AgentSessionAddress,
  AgentSessionStore,
  CielAgentOptions,
  CreateAgentSessionStoreOptions,
} from './agent/index.ts';
export { createAgentSessionStore } from './agent/index.ts';
export type {
  AnyFunction,
  Instrument,
  InstrumentContext,
  InterceptorWrapper,
} from './instrumentation.ts';

function normalizeId(value: string, name: string): string {
  const normalized = value.trim();
  if (!normalized) throw new TypeError(`${name} must not be empty`);
  return normalized;
}

function createInheritedAgentConfig(options: DefineCielOptions): AgentConfig {
  const config = { ...options } as Record<string, unknown>;
  for (const key of ['id', 'instructions', 'plugins', 'prompt', 'sessionId', 'sessionStore']) {
    Reflect.deleteProperty(config, key);
  }
  return Object.freeze(config) as AgentConfig;
}

export function defineCiel(options: DefineCielOptions): Ciel {
  const id = normalizeId(options.id ?? randomUUID(), 'Ciel id');
  const sessionId = normalizeId(options.sessionId ?? randomUUID(), 'Ciel sessionId');
  const sessionStore =
    options.sessionStore === false
      ? undefined
      : (options.sessionStore ?? createAgentSessionStore());
  const scopes: LifecycleScope[] = [];
  const collected = collectPlugins(options.plugins, createInheritedAgentConfig(options), id);
  const engram = createEngram({ recentLimit: 100 });
  const instrument = createInstrumenter(collected.interceptors);
  const plugins = resolvePlugins(collected, instrument);
  const contribution = resolvePluginContributions(plugins);
  const project = createProjectorRunner(contribution.projectors);

  const agent = createAgentRuntime({
    ...options,
    cielId: id,
    engram,
    hasProjectors: contribution.projectors.length > 0,
    instrument,
    project,
    sessionId,
    sessionStore,
    tools: contribution.tools,
  });

  const services: RuntimeServices = {
    engram,
    scopes,
    signalBus: createSignalBus(),
    think: agent.think,
  };

  const lifecycle = createLifecycle({
    name: 'Ciel',
    async setup() {
      installSensu(plugins, services);
      await agent.start();
      const agentScope = createLifecycleScope();
      agentScope.onDispose(() => agent.stop());
      scopes.push(agentScope);
      await startPlugins(plugins, services);
    },
    async dispose() {
      await disposeScopes(scopes);
    },
  });

  function start(): Promise<void> {
    return lifecycle.start();
  }

  function stop(): Promise<void> {
    return lifecycle.stop();
  }

  const ciel: Ciel = {
    get status() {
      return lifecycle.status;
    },
    get messages() {
      return agent.messages;
    },
    id,
    sessionId,
    engram,
    think: agent.think,
    start,
    stop,
  };

  return ciel;
}
