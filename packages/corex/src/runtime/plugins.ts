import type { Instrument, Interceptor } from '@cieljs/instrument';
import type { AgentTool } from '@earendil-works/pi-agent-core';

import type { AnyProjector, CielPlugin, PluginOption, Projector, Sensu } from '#plugin/index.ts';

export interface ResolvedPlugin {
  readonly definition: CielPlugin;
  readonly instrument: Instrument;
}

interface OwnedPrimitive<TPrimitive> {
  readonly primitive: TPrimitive;
  readonly instrument: Instrument;
  readonly plugin: ResolvedPlugin;
}

export interface ResolvedTool {
  readonly tool: AgentTool<any>;
  readonly instrument: Instrument;
  readonly plugin?: ResolvedPlugin;
}

export type ResolvedProjector = OwnedPrimitive<AnyProjector>;
export type ResolvedSensu = OwnedPrimitive<Sensu>;

export interface ResolvedPlugins {
  readonly instructions: readonly string[];
  readonly plugins: readonly ResolvedPlugin[];
  readonly projectors: readonly ResolvedProjector[];
  readonly sensu: readonly ResolvedSensu[];
  readonly tools: readonly ResolvedTool[];
}

export function flattenPluginOptions(options: readonly PluginOption[]): CielPlugin[] {
  return options.flatMap(option => {
    if (!option) return [];
    return Array.isArray(option)
      ? flattenPluginOptions(option as readonly PluginOption[])
      : [option as CielPlugin];
  });
}

export function collectInterceptors(plugins: readonly CielPlugin[]): readonly Interceptor[] {
  return plugins.flatMap(plugin => [...(plugin.interceptors ?? [])]);
}

function bindPrimitiveInstrument(
  plugin: ResolvedPlugin,
  primitive: Projector | Sensu,
  kind: 'projector' | 'sensu',
): Instrument {
  return plugin.instrument.with({
    metadata: {
      [`${kind}Id`]: primitive.id,
      [`${kind}Name`]: primitive.name,
    },
  });
}

function assertUniqueId(
  ids: Set<string>,
  value: { readonly id: string; readonly name: string },
  label: string,
): void {
  if (ids.has(value.id)) throw new Error(`${label} "${value.name}" is installed more than once`);
  ids.add(value.id);
}

export function resolvePlugins(
  definitions: readonly CielPlugin[],
  options: {
    readonly instrument: Instrument;
    readonly tools?: readonly AgentTool<any>[];
  },
): ResolvedPlugins {
  const ids = new Set<string>();
  const instructions: string[] = [];
  const plugins: ResolvedPlugin[] = [];
  const projectors: ResolvedProjector[] = [];
  const sensu: ResolvedSensu[] = [];
  const tools: ResolvedTool[] =
    options.tools?.map(tool => ({ tool, instrument: options.instrument })) ?? [];

  for (const definition of definitions) {
    assertUniqueId(ids, definition, 'Ciel plugin');
    const plugin: ResolvedPlugin = {
      definition,
      instrument: options.instrument.with({
        metadata: { pluginId: definition.id, pluginName: definition.name },
      }),
    };
    plugins.push(plugin);

    const pluginInstructions = definition.instructions?.trim();
    if (pluginInstructions) instructions.push(pluginInstructions);

    for (const projector of definition.projectors ?? []) {
      assertUniqueId(ids, projector, 'Projector');
      projectors.push({
        primitive: projector,
        instrument: bindPrimitiveInstrument(plugin, projector, 'projector'),
        plugin,
      });
    }
    for (const definitionSensu of definition.sensu ?? []) {
      assertUniqueId(ids, definitionSensu, 'Sensu');
      sensu.push({
        primitive: definitionSensu,
        instrument: bindPrimitiveInstrument(plugin, definitionSensu, 'sensu'),
        plugin,
      });
    }
    for (const tool of definition.tools ?? []) {
      tools.push({ tool, instrument: plugin.instrument, plugin });
    }
  }

  assertUniqueNames(tools, value => value.tool.name, 'Agent tool');
  assertUniqueNames(projectors, value => value.primitive.name, 'Agent projector');
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
      : `host ${label.toLowerCase()} "${name}"`;

    const existing = sources.get(name);

    if (existing)
      throw new Error(`${label} "${name}" is provided by both ${existing} and ${source}`);

    sources.set(name, source);
  }
}
