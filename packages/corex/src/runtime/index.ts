import { randomUUID } from 'node:crypto';

import { createEngram } from '#model/engram/index.ts';
import type { AnySignal } from '#model/signal/index.ts';
import type { ResolvedCielConfig } from '#plugin/index.ts';

import { createAgentRuntime } from './agent/runtime.ts';
import { createAgentSessionStore } from './agent/session.ts';
import type { AgentConfig } from './agent/types.ts';
import { createSignalBus } from './event-bus/index.ts';
import {
  cielOperation,
  CielOperation,
  createInstrumenter,
  type CielOperation as CielOperationDescriptor,
} from './instrumentation.ts';
import { createLifecycle } from './lifecycle/index.ts';
import {
  collectInterceptors,
  flattenPluginOptions,
  resolvePlugins,
  type ResolvedPlugin,
} from './plugins.ts';
import { createProjectorRunner } from './projector.ts';
import { installSensu, type SensuRuntime } from './sensu.ts';
import type { Ciel, DefineCielOptions } from './types.ts';

export type { Ciel, CielStatus, DefineCielOptions, Think } from './types.ts';
export { cielOperation, CielOperation, CielOperationTag } from './instrumentation.ts';
export type { CielOperationMetadata, CielOperationName } from './instrumentation.ts';
export type { Operation } from './operation.ts';
export type {
  AgentCompactionOptions,
  AgentConfig,
  AgentContextTokenCounter,
  AgentContextTokenCounterInput,
  AgentContext,
  AgentContextBuilder,
  AgentEventHandler,
  AgentFrame,
  AgentMessage,
  AgentMessageConverter,
  AgentPrompt,
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
  InstrumentPreset,
  InterceptorWrapper,
} from './instrumentation.ts';

function normalizeId(value: string, name: string): string {
  const normalized = value.trim();
  if (!normalized) throw new TypeError(`${name} must not be empty`);
  return normalized;
}

function createInheritedAgentConfig(options: DefineCielOptions): AgentConfig {
  const config = { ...options } as Record<string, unknown>;
  for (const key of [
    'id',
    'instructions',
    'plugins',
    'prompt',
    'sessionId',
    'sessionStore',
    'tools',
  ]) {
    Reflect.deleteProperty(config, key);
  }
  return Object.freeze(config) as AgentConfig;
}

function mergeInstructions(base: string, plugins: readonly string[]): string {
  return [base.trim(), ...plugins].filter(Boolean).join('\n\n');
}

async function settle(actions: readonly (() => Promise<void>)[], errors: unknown[]): Promise<void> {
  for (const action of actions) {
    try {
      await action();
    } catch (error) {
      errors.push(error);
    }
  }
}

function lifecycleOperation(
  plugin: ResolvedPlugin,
  operation: CielOperationDescriptor,
  action: () => unknown,
) {
  return plugin.instrument.with(cielOperation(operation))(action);
}

export function defineCiel(options: DefineCielOptions): Ciel {
  const id = normalizeId(options.id ?? randomUUID(), 'Ciel id');
  const sessionId = normalizeId(options.sessionId ?? randomUUID(), 'Ciel sessionId');
  const sessionStore =
    options.sessionStore === false
      ? undefined
      : (options.sessionStore ?? createAgentSessionStore());
  const pluginDefinitions = flattenPluginOptions(options.plugins ?? []);
  const instrument = createInstrumenter(...collectInterceptors(pluginDefinitions));
  const plugins = resolvePlugins(pluginDefinitions, { instrument, tools: options.tools });
  const engram = createEngram({ recentLimit: 100 });
  const signalBus = createSignalBus();
  const project = createProjectorRunner(plugins.projectors);
  const { id: _id, plugins: _plugins, tools: _tools, ...agentOptions } = options;
  const instructions = mergeInstructions(options.instructions, plugins.instructions);
  const agentConfig = createInheritedAgentConfig(options);
  const resolvedConfig: ResolvedCielConfig = Object.freeze({
    id,
    sessionId,
    model: options.model,
    instructions,
    plugins: Object.freeze([...pluginDefinitions]),
    tools: Object.freeze(plugins.tools.map(value => value.tool)),
    agent: agentConfig,
    ...(sessionStore ? { sessionStore } : {}),
  });
  const agent = createAgentRuntime({
    ...agentOptions,
    cielId: id,
    engram,
    hasProjectors: plugins.projectors.length > 0,
    instrument,
    instructions,
    project,
    sessionId,
    sessionStore,
    tools: plugins.tools.length > 0 ? plugins.tools : undefined,
  });
  const initialized: ResolvedPlugin[] = [];
  const activated: ResolvedPlugin[] = [];
  const sensuRuntimes: SensuRuntime[] = [];
  let agentStarted = false;
  let acceptSignals = false;
  let configWasResolved = false;

  const lifecycle = createLifecycle({
    name: 'Ciel',
    async setup() {
      if (!configWasResolved) {
        for (const plugin of plugins.plugins) {
          if (!plugin.definition.configResolved) continue;
          await lifecycleOperation(plugin, CielOperation.PluginConfigResolved, () =>
            plugin.definition.configResolved!(resolvedConfig),
          )();
        }
        configWasResolved = true;
      }

      // Phase 1 prepares Plugin resources without accepting Signal input
      for (const plugin of plugins.plugins) {
        initialized.push(plugin);
        if (plugin.definition.initialize) {
          await lifecycleOperation(plugin, CielOperation.PluginInitialize, () =>
            plugin.definition.initialize!(),
          )();
        }
      }

      // Phase 2 installs every consumer before sources are activated
      for (const sensu of plugins.sensu) {
        sensuRuntimes.push(await installSensu(sensu, { engram, signalBus, think: agent.think }));
      }

      await agent.start();
      agentStarted = true;
      acceptSignals = true;

      // Phase 3 activates internal Runtime integrations after Agent and Sensu are ready
      for (const plugin of plugins.plugins) {
        activated.push(plugin);
        if (!plugin.definition.activate) continue;
        await lifecycleOperation(plugin, CielOperation.PluginActivate, () =>
          plugin.definition.activate!({ ciel }),
        )();
      }
    },
    async dispose() {
      const errors: unknown[] = [];
      acceptSignals = false;

      // Phase 4 stops producers before draining Sensu and Agent queues
      await settle(
        activated
          .splice(0)
          .reverse()
          .map(plugin => async () => {
            if (plugin.definition.deactivate) {
              await lifecycleOperation(plugin, CielOperation.PluginDeactivate, () =>
                plugin.definition.deactivate!(),
              )();
            }
          }),
        errors,
      );
      await settle(
        sensuRuntimes
          .splice(0)
          .reverse()
          .map(runtime => () => runtime.close()),
        errors,
      );

      if (agentStarted) {
        await settle([() => agent.stop()], errors);
        agentStarted = false;
      }

      await settle(
        initialized
          .splice(0)
          .reverse()
          .map(plugin => async () => {
            if (plugin.definition.dispose) {
              await lifecycleOperation(plugin, CielOperation.PluginDispose, () =>
                plugin.definition.dispose!(),
              )();
            }
          }),
        errors,
      );

      if (errors.length === 1) throw errors[0];
      if (errors.length > 1) throw new AggregateError(errors, 'Failed to stop Ciel');
    },
  });

  const ciel: Ciel = {
    get status() {
      return lifecycle.status;
    },
    get messages() {
      return agent.messages;
    },
    get contextTokens() {
      return agent.contextTokens;
    },
    id,
    sessionId,
    engram,
    think: agent.think,
    start: () => lifecycle.start(),
    stop: () => lifecycle.stop(),
    dispatchSignal: instrument.with(cielOperation(CielOperation.SignalDispatch))(
      async (signal: AnySignal) => {
        if (!acceptSignals) throw new Error('Ciel cannot dispatch Signal while it is not running');
        await signalBus.dispatchSignal(signal);
      },
    ),
  };

  return ciel;
}
