import type { AnyFunction, InstrumentContext, Interceptor } from '@ciels/interceptor';
import type { AgentTool } from '@earendil-works/pi-agent-core';

import type { Engram } from '#model/engram/index.ts';
import type { AnySignal, AnySignalDefinition, SignalHandler } from '#model/signal/index.ts';
import type {
  AnyProjectorOptions,
  CielPlugin,
  PluginContribution,
  PluginContext,
  SensuHandler,
  Sensu,
} from '#plugin/types.ts';
import type { Dispose } from '#shared/async.ts';

import type { AgentConfig } from './agent/index.ts';
import type { SignalBus } from './event-bus/index.ts';
import { CielOperationName, type Instrument } from './instrumentation.ts';
import { createLifecycleScope, type LifecycleScope } from './lifecycle/index.ts';
import { bindPluginInstrument } from './plugin-instrumentation.ts';
import type { InstallableCielPluginEntry, Think } from './types.ts';

export interface RuntimeServices {
  readonly engram: Engram;
  readonly scopes: LifecycleScope[];
  readonly signalBus: SignalBus;
  readonly think: Think;
}

interface LifecycleRegistration {
  readonly plugin: CielPlugin;
  readonly starts: readonly Dispose[];
  readonly disposes: readonly Dispose[];
  bindEmit(emit: PluginContext['emitSignal'] | undefined): void;
  bindInstrument(instrument: Instrument | undefined): void;
}

interface SensuRegistration {
  readonly plugin: CielPlugin;
  readonly definition: AnySignalDefinition;
  readonly sensu: SensuHandler<AnySignalDefinition>;
  enabled: boolean;
  dispose?: Dispose;
}

interface ResolvedLifecycleRegistration extends LifecycleRegistration {
  readonly instrument: Instrument;
}

interface ResolvedSensuRegistration extends SensuRegistration {
  readonly instrument: Instrument;
}

interface Provided<TValue> {
  readonly plugin: CielPlugin;
  readonly value: TValue;
}

export interface ResolvedTool extends Provided<AgentTool<any>> {
  readonly instrument: Instrument;
}

interface CollectedProjector {
  readonly key: string;
  readonly plugin: CielPlugin;
  readonly projector: AnyProjectorOptions;
}

export interface ResolvedProjector extends CollectedProjector {
  readonly instrument: Instrument;
}

interface CollectedPlugins {
  readonly interceptors: readonly Interceptor[];
  readonly lifecycles: readonly LifecycleRegistration[];
  readonly projectors: readonly CollectedProjector[];
  readonly sensu: readonly SensuRegistration[];
  readonly tools: readonly Provided<AgentTool<any>>[];
}

export interface ResolvedPlugins {
  readonly lifecycles: readonly ResolvedLifecycleRegistration[];
  readonly projectors: readonly ResolvedProjector[];
  readonly sensu: readonly ResolvedSensuRegistration[];
  readonly tools: readonly ResolvedTool[];
}

/**
 * 收集阶段的内部可变容器；返回运行时前以 ResolvedPlugins 只读暴露。
 */
interface PluginCollection {
  readonly interceptors: Interceptor[];
  readonly lifecycles: LifecycleRegistration[];
  readonly projectors: CollectedProjector[];
  readonly sensu: SensuRegistration[];
  readonly tools: Provided<AgentTool<any>>[];
}

export interface ResolvedPluginContributions {
  readonly projectors: readonly ResolvedProjector[];
  readonly tools: readonly ResolvedTool[] | undefined;
}

function normalizeMany<T>(value: T | readonly T[] | undefined): readonly T[] {
  return value === undefined ? [] : Array.isArray(value) ? value : [value as T];
}

function flattenPlugins(entries: readonly InstallableCielPluginEntry[]): CielPlugin[] {
  return entries.flatMap(entry => (Array.isArray(entry) ? [...entry] : [entry as CielPlugin]));
}

function isPromiseLike(value: unknown): value is PromiseLike<unknown> {
  return (
    value !== null &&
    typeof value === 'object' &&
    'then' in value &&
    typeof value.then === 'function'
  );
}

function addPluginContributions(
  plugin: CielPlugin,
  contribution: PluginContribution,
  plugins: PluginCollection,
): void {
  for (const interceptor of contribution.interceptors ?? []) plugins.interceptors.push(interceptor);
  for (const projector of contribution.projectors ?? []) {
    plugins.projectors.push({ key: projector.name, plugin, projector });
  }
  for (const tool of contribution.tools ?? []) plugins.tools.push({ plugin, value: tool });
}

/**
 * 创建只在 setup 同步执行期间可用的注册入口。
 *
 * Plugin 的静态声明和 setup 内的 provide 都流向同一批收集器。
 *
 * Setup 返回后关闭入口，避免异步回调在 Ciel 已完成构建后改变其能力集合。
 */
function createPluginContext(
  plugin: CielPlugin,
  agent: AgentConfig,
  id: string,
  plugins: PluginCollection,
): {
  readonly context: PluginContext;
  readonly lifecycle: LifecycleRegistration;
  readonly seal: () => void;
} {
  let active = true;
  let runtimeEmit: PluginContext['emitSignal'] | undefined;
  let runtimeInstrument: Instrument | undefined;
  const starts: Dispose[] = [];
  const disposes: Dispose[] = [];

  const assertActive = () => {
    if (!active) {
      throw new Error(`Ciel plugin "${plugin.name}" cannot register capabilities after setup`);
    }
  };

  const provide = (contribution: PluginContribution) => {
    assertActive();
    addPluginContributions(plugin, contribution, plugins);
  };

  const emitSignal = (signal: AnySignal) => {
    // emitSignal 依赖运行时 SignalBus，所以在 startPlugins 中才被绑定。
    if (!runtimeEmit) {
      return Promise.reject(
        new Error(`Ciel plugin "${plugin.name}" cannot emit while Ciel is not running`),
      );
    }
    return runtimeEmit(signal);
  };

  const instrument: Instrument = <T extends AnyFunction>(
    target: T,
    context?: InstrumentContext,
  ): T => {
    let instrumented: T | undefined;

    return function (this: ThisParameterType<T>, ...args: Parameters<T>): ReturnType<T> {
      if (!runtimeInstrument) {
        throw new Error(
          `Ciel plugin "${plugin.name}" cannot run instruments while Ciel is not running`,
        );
      }

      instrumented ??= runtimeInstrument(target, context);
      return Reflect.apply(instrumented, this, args);
    } as T;
  };

  const sensu: Sensu = (definition, handler) => {
    assertActive();
    const registration: SensuRegistration = {
      plugin,
      definition,
      sensu: handler as SensuHandler<AnySignalDefinition>,
      enabled: true,
    };
    plugins.sensu.push(registration);
    return () => {
      // 注册可在启动前取消；安装完成后还会一并解除 SignalBus 订阅。
      registration.enabled = false;
      return registration.dispose?.();
    };
  };

  return {
    context: {
      id,
      agent,
      emitSignal,
      instrument,
      sensu,
      onStart(start) {
        assertActive();
        starts.push(start);
      },
      onDispose(dispose) {
        assertActive();
        disposes.push(dispose);
      },
      provide,
    },
    lifecycle: {
      plugin,
      starts,
      disposes,
      bindEmit(emit) {
        runtimeEmit = emit;
      },
      bindInstrument(instrument) {
        runtimeInstrument = instrument;
      },
    },
    seal() {
      active = false;
    },
  };
}

function collectPlugin(
  plugin: CielPlugin,
  agent: AgentConfig,
  id: string,
  plugins: PluginCollection,
): LifecycleRegistration {
  const { context, lifecycle, seal } = createPluginContext(plugin, agent, id, plugins);

  // Plugin 自身的 fields 等价于 setup 中第一次 ctx.provide()。
  // 先归集它们，以保留声明顺序。
  context.provide(plugin);

  try {
    const result = plugin.setup?.(context);
    if (isPromiseLike(result)) {
      throw new TypeError(
        `Ciel plugin "${plugin.name}" setup must be synchronous; register async work with onStart()`,
      );
    }
  } finally {
    // 即使 setup 抛错也封闭入口，防止捕获 context 的延迟任务继续写入收集结果。
    seal();
  }

  return lifecycle;
}

/**
 * 同步收集 Plugin 声明，并在 setup 返回后关闭注册入口。
 */
export function collectPlugins(
  entries: readonly InstallableCielPluginEntry[],
  agent: AgentConfig,
  id: string,
): CollectedPlugins {
  const ids = new Set<string>();
  const resolved: PluginCollection = {
    interceptors: [],
    lifecycles: [],
    projectors: [],
    sensu: [],
    tools: [],
  };

  for (const plugin of flattenPlugins(entries)) {
    if (ids.has(plugin.id)) {
      throw new Error(`Ciel plugin "${plugin.name}" is installed more than once`);
    }

    ids.add(plugin.id);
    resolved.lifecycles.push(collectPlugin(plugin, agent, id, resolved));
  }

  return resolved;
}

function assertUniqueContributions(plugins: CollectedPlugins): void {
  const toolSources = new Map<string, string>();

  for (const provided of plugins.tools) {
    const source = toolSources.get(provided.value.name);

    if (source) {
      throw new Error(
        `Agent tool "${provided.value.name}" is provided by both ${source} and plugin "${provided.plugin.name}"`,
      );
    }

    toolSources.set(provided.value.name, `plugin "${provided.plugin.name}"`);
  }

  const projectorSources = new Map<string, string>();

  for (const provided of plugins.projectors) {
    const source = projectorSources.get(provided.key);

    if (source) {
      throw new Error(
        `Agent projector "${provided.key}" is provided by both ${source} and plugin "${provided.plugin.name}"`,
      );
    }

    projectorSources.set(provided.key, `plugin "${provided.plugin.name}"`);
  }
}

export function resolvePlugins(plugins: CollectedPlugins, instrument: Instrument): ResolvedPlugins {
  assertUniqueContributions(plugins);

  const instruments = new Map<string, Instrument>();
  const resolveInstrument = (plugin: CielPlugin): Instrument => {
    let resolved = instruments.get(plugin.id);
    if (!resolved) {
      resolved = bindPluginInstrument(instrument, plugin);
      instruments.set(plugin.id, resolved);
    }
    return resolved;
  };

  return {
    lifecycles: plugins.lifecycles.map(lifecycle => ({
      ...lifecycle,
      instrument: resolveInstrument(lifecycle.plugin),
    })),
    projectors: plugins.projectors.map(projector => ({
      ...projector,
      instrument: resolveInstrument(projector.plugin),
    })),
    sensu: plugins.sensu.map(sensu => ({
      ...sensu,
      instrument: resolveInstrument(sensu.plugin),
    })),
    tools: plugins.tools.map(tool => ({
      ...tool,
      instrument: resolveInstrument(tool.plugin),
    })),
  };
}

export function resolvePluginContributions(plugins: ResolvedPlugins): ResolvedPluginContributions {
  return {
    projectors: plugins.projectors,
    tools: plugins.tools.length === 0 ? undefined : plugins.tools,
  };
}

/**
 * 在 Plugin 启动前一次性安装所有 Sensu。
 */
export function installSensu(plugins: ResolvedPlugins, services: RuntimeServices): void {
  const scope = createLifecycleScope();

  services.scopes.push(scope);

  for (const registration of plugins.sensu) {
    if (!registration.enabled) continue;

    const run = registration.instrument(registration.sensu, {
      name: CielOperationName.Sensu,
      metadata: {
        signalDefinitionId: registration.definition.id,
        signalDefinitionName: registration.definition.name,
      },
    });

    const handler: SignalHandler<typeof registration.definition> = async signal => {
      const result = await run(signal);
      if (!result) return;
      services.engram.append(...normalizeMany(result.percepts));
      for (const cue of normalizeMany(result.cues)) {
        void services.think(cue).catch(() => undefined);
      }
    };

    registration.dispose = services.signalBus.onSignal(registration.definition, handler);
    scope.onDispose(registration.dispose);
  }
}

/**
 * Agent 就绪后激活 emitSignal，并按声明顺序启动 Plugin。
 */
export async function startPlugins(
  plugins: ResolvedPlugins,
  services: RuntimeServices,
): Promise<void> {
  for (const registration of plugins.lifecycles) {
    registration.bindInstrument(registration.instrument);
    registration.bindEmit(
      registration.instrument(services.signalBus.emitSignal, {
        name: CielOperationName.SignalEmit,
      }),
    );
    const scope = createLifecycleScope();

    services.scopes.push(scope);
    scope.onDispose(() => registration.bindEmit(undefined));
    scope.onDispose(() => registration.bindInstrument(undefined));

    for (const dispose of registration.disposes) scope.onDispose(dispose);

    for (const start of registration.starts) {
      await registration.instrument(start, {
        name: CielOperationName.PluginStart,
      })();
    }
  }
}
