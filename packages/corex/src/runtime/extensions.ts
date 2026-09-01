import type { Instrument, Interceptor } from '@ciels/interceptor';
import type { AgentTool } from '@earendil-works/pi-agent-core';

import type {
  AnyProjectorExtension,
  CielExtension,
  CielExtensionEntry,
  CielPlugin,
  InterceptorExtension,
  PluginCapability,
  PluginInstance,
  SensuExtension,
} from '#extension';
import type { AgentConfig } from '#runtime/agent/index.ts';

import { cielOperation, CielOperationName } from './instrumentation.ts';

export interface ResolvedPlugin {
  readonly definition: CielPlugin;
  readonly instance: PluginInstance;
  readonly instrument: Instrument;
}

interface OwnedExtension<TExtension> {
  readonly extension: TExtension;
  readonly instrument: Instrument;
  readonly plugin?: ResolvedPlugin;
}

export interface ResolvedTool {
  readonly tool: AgentTool<any>;
  readonly instrument: Instrument;
  readonly plugin?: ResolvedPlugin;
}
export type ResolvedProjector = OwnedExtension<AnyProjectorExtension>;
export type ResolvedSensu = OwnedExtension<SensuExtension>;

export interface ResolvedExtensions {
  readonly instructions: readonly string[];
  readonly plugins: readonly ResolvedPlugin[];
  readonly projectors: readonly ResolvedProjector[];
  readonly sensu: readonly ResolvedSensu[];
  readonly tools: readonly ResolvedTool[];
}

export function flattenExtensionEntries(entries: readonly CielExtensionEntry[]): CielExtension[] {
  return entries.flatMap(entry =>
    Array.isArray(entry)
      ? flattenExtensionEntries(entry as readonly CielExtensionEntry[])
      : [entry as CielExtension],
  );
}

export function collectInterceptors(extensions: readonly CielExtension[]): readonly Interceptor[] {
  // Build the complete chain before any PluginInstance can run user code
  return extensions.flatMap(extension => {
    if (extension.kind === 'interceptor') {
      return [(extension as InterceptorExtension).interceptor];
    }
    if (extension.kind === 'plugin') {
      return [...((extension as CielPlugin).interceptors ?? [])];
    }
    return [];
  });
}

function bindExtensionInstrument(instrument: Instrument, extension: PluginCapability): Instrument {
  // Extension identity is trusted metadata inherited by every internal operation
  return instrument.with({
    metadata: {
      extensionId: extension.id,
      extensionName: extension.name,
      extensionKind: extension.kind,
    },
  });
}

function assertUniqueId(
  ids: Set<string>,
  extension: { readonly id: string; readonly name: string },
) {
  if (ids.has(extension.id)) {
    throw new Error(`Ciel extension "${extension.name}" is installed more than once`);
  }
  ids.add(extension.id);
}

export function resolveExtensions(
  extensions: readonly CielExtension[],
  options: {
    readonly agent: AgentConfig;
    readonly cielId: string;
    readonly instrument: Instrument;
    readonly tools?: readonly AgentTool<any>[];
  },
): ResolvedExtensions {
  const ids = new Set<string>();
  const instructions: string[] = [];
  const plugins: ResolvedPlugin[] = [];
  const projectors: ResolvedProjector[] = [];
  const sensu: ResolvedSensu[] = [];
  const tools: ResolvedTool[] =
    options.tools?.map(tool => ({ tool, instrument: options.instrument })) ?? [];

  // Plugin capabilities inherit Plugin identity before adding Extension identity
  const addCapability = (extension: PluginCapability, plugin?: ResolvedPlugin) => {
    assertUniqueId(ids, extension);
    const instrument = bindExtensionInstrument(plugin?.instrument ?? options.instrument, extension);
    const owned = { extension, instrument, plugin };

    if (extension.kind === 'projector') projectors.push(owned as ResolvedProjector);
    else sensu.push(owned as ResolvedSensu);
  };

  for (const extension of extensions) {
    if (extension.kind === 'interceptor') {
      assertUniqueId(ids, extension);
      continue;
    }

    if (extension.kind !== 'plugin') {
      addCapability(extension);
      continue;
    }

    assertUniqueId(ids, extension);
    const instrument = options.instrument.with({
      metadata: {
        pluginId: extension.id,
        pluginName: extension.name,
      },
    });
    const create = instrument.with(cielOperation(CielOperationName.PluginCreate))(extension.create);
    const plugin: ResolvedPlugin = {
      definition: extension,
      instrument,
      instance: create({
        agent: options.agent,
        cielId: options.cielId,
        instrument,
      }),
    };
    plugins.push(plugin);

    const pluginInstructions = plugin.instance.instructions?.trim();
    if (pluginInstructions) instructions.push(pluginInstructions);

    for (const capability of plugin.instance.extensions ?? []) {
      addCapability(capability, plugin);
    }
    for (const tool of plugin.instance.tools ?? []) {
      tools.push({ tool, instrument: plugin.instrument, plugin });
    }
  }

  assertUniqueNames(tools, value => value.tool.name, 'Agent tool');
  assertUniqueNames(projectors, value => value.extension.name, 'Agent projector');
  return { instructions, plugins, projectors, sensu, tools };
}

function assertUniqueNames<T extends { readonly plugin?: ResolvedPlugin }>(
  values: readonly T[],
  readName: (value: T) => string,
  label: string,
): void {
  const sources = new Map<string, string>();
  for (const value of values) {
    const name = readName(value);
    const source = value.plugin
      ? `plugin "${value.plugin.definition.name}"`
      : `direct ${label.toLowerCase()} "${name}"`;
    const existing = sources.get(name);
    if (existing)
      throw new Error(`${label} "${name}" is provided by both ${existing} and ${source}`);
    sources.set(name, source);
  }
}
