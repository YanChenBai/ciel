import { randomUUID } from 'node:crypto';

import { createEngram } from '#model/engram/index.ts';
import type { AnySignal } from '#model/signal/index.ts';

import { createAgentRuntime } from './agent/runtime.ts';
import { createAgentSessionStore } from './agent/session.ts';
import type { AgentConfig } from './agent/types.ts';
import { createSignalBus } from './event-bus/index.ts';
import {
  collectInterceptors,
  flattenExtensionEntries,
  resolveExtensions,
  type ResolvedPlugin,
} from './extensions.ts';
import {
  cielOperation,
  CielOperation,
  createInstrumenter,
  type CielOperation as CielOperationDescriptor,
} from './instrumentation.ts';
import { createLifecycle } from './lifecycle/index.ts';
import { createProjectorRunner } from './projector.ts';
import { installSensu, type SensuRuntime } from './sensu.ts';
import type { Ciel, DefineCielOptions } from './types.ts';

export type { Ciel, CielStatus, DefineCielOptions, Think } from './types.ts';
export { CielOperation, CielOperationTag } from './instrumentation.ts';
export type { CielOperationMetadata } from './instrumentation.ts';
export type {
  AgentConfig,
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
    'extensions',
    'id',
    'instructions',
    'prompt',
    'sessionId',
    'sessionStore',
    'tools',
  ]) {
    Reflect.deleteProperty(config, key);
  }
  return Object.freeze(config) as AgentConfig;
}

function mergeInstructions(base: string, extensions: readonly string[]): string {
  return [base.trim(), ...extensions].filter(Boolean).join('\n\n');
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
  const extensionEntries = flattenExtensionEntries(options.extensions);
  const instrument = createInstrumenter(collectInterceptors(extensionEntries));
  const extensions = resolveExtensions(extensionEntries, {
    agent: createInheritedAgentConfig(options),
    cielId: id,
    instrument,
    tools: options.tools,
  });
  const engram = createEngram({ recentLimit: 100 });
  const signalBus = createSignalBus();
  const project = createProjectorRunner(extensions.projectors);
  const { extensions: _extensions, id: _id, tools: _tools, ...agentOptions } = options;
  const agent = createAgentRuntime({
    ...agentOptions,
    cielId: id,
    engram,
    hasProjectors: extensions.projectors.length > 0,
    instrument,
    instructions: mergeInstructions(options.instructions, extensions.instructions),
    project,
    sessionId,
    sessionStore,
    tools: extensions.tools.length > 0 ? extensions.tools : undefined,
  });
  const initialized: ResolvedPlugin[] = [];
  const activated: ResolvedPlugin[] = [];
  const sensuRuntimes: SensuRuntime[] = [];
  let agentStarted = false;
  let acceptSignals = false;

  const lifecycle = createLifecycle({
    name: 'Ciel',
    async setup() {
      // Phase 1 prepares Plugin resources without allowing Signal emission
      for (const plugin of extensions.plugins) {
        initialized.push(plugin);
        if (plugin.instance.initialize) {
          await lifecycleOperation(plugin, CielOperation.PluginInitialize, () =>
            plugin.instance.initialize!(),
          )();
        }
      }

      // Phase 2 installs every consumer before sources are activated
      for (const sensu of extensions.sensu) {
        sensuRuntimes.push(await installSensu(sensu, { engram, signalBus, think: agent.think }));
      }

      await agent.start();
      agentStarted = true;
      acceptSignals = true;

      // Phase 3 activates sources after Agent and Sensu are ready
      for (const plugin of extensions.plugins) {
        activated.push(plugin);
        if (!plugin.instance.activate) continue;
        const emitSignal = plugin.instrument.with(cielOperation(CielOperation.SignalEmit))(
          async (signal: AnySignal) => {
            if (!acceptSignals) {
              throw new Error(
                `Ciel plugin "${plugin.definition.name}" cannot emit while Ciel is not running`,
              );
            }
            await signalBus.emitSignal(signal);
          },
        );
        await lifecycleOperation(plugin, CielOperation.PluginActivate, () =>
          plugin.instance.activate!({ emitSignal }),
        )();
      }
    },
    async dispose() {
      const errors: unknown[] = [];

      // Phase 4 stops producers before draining Sensu and Agent queues
      await settle(
        activated
          .splice(0)
          .reverse()
          .map(plugin => async () => {
            if (plugin.instance.deactivate) {
              await lifecycleOperation(plugin, CielOperation.PluginDeactivate, () =>
                plugin.instance.deactivate!(),
              )();
            }
          }),
        errors,
      );
      acceptSignals = false;

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
            if (plugin.instance.dispose) {
              await lifecycleOperation(plugin, CielOperation.PluginDispose, () =>
                plugin.instance.dispose!(),
              )();
            }
          }),
        errors,
      );

      if (errors.length === 1) throw errors[0];
      if (errors.length > 1) throw new AggregateError(errors, 'Failed to stop Ciel');
    },
  });

  return {
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
    start: () => lifecycle.start(),
    stop: () => lifecycle.stop(),
  };
}
