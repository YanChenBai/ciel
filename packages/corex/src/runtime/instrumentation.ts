import type { InstrumentContext } from '@ciels/interceptor';

export { createInstrumenter } from '@ciels/interceptor';
export type { AnyFunction, InstrumentPreset, InterceptorWrapper } from '@ciels/interceptor';

export const CielOperationTag = {
  Agent: 'AGENT',
  Context: 'CONTEXT',
  Cue: 'CUE',
  Plugin: 'PLUGIN',
  Sensu: 'SENSU',
  Signal: 'SIGNAL',
  Tool: 'TOOL',
} as const;

export type CielOperationTag = (typeof CielOperationTag)[keyof typeof CielOperationTag];

export const CielOperation = {
  CueSubmit: { name: 'ciel.cue.submit', label: 'Cue Submit', tag: CielOperationTag.Cue },
  AgentRun: { name: 'ciel.agent.run', label: 'Agent Run', tag: CielOperationTag.Agent },
  AgentPrompt: {
    name: 'ciel.agent.prompt',
    label: 'Agent Prompt',
    tag: CielOperationTag.Context,
  },
  ModelGenerate: {
    name: 'ciel.model.generate',
    label: 'Model Generate',
    tag: CielOperationTag.Agent,
  },
  ToolExecute: {
    name: 'ciel.tool.execute',
    label: 'Tool Execute',
    tag: CielOperationTag.Tool,
  },
  PluginCreate: {
    name: 'ciel.plugin.create',
    label: 'Plugin Create',
    tag: CielOperationTag.Plugin,
  },
  PluginInitialize: {
    name: 'ciel.plugin.initialize',
    label: 'Plugin Initialize',
    tag: CielOperationTag.Plugin,
  },
  PluginActivate: {
    name: 'ciel.plugin.activate',
    label: 'Plugin Activate',
    tag: CielOperationTag.Plugin,
  },
  PluginDeactivate: {
    name: 'ciel.plugin.deactivate',
    label: 'Plugin Deactivate',
    tag: CielOperationTag.Plugin,
  },
  PluginDispose: {
    name: 'ciel.plugin.dispose',
    label: 'Plugin Dispose',
    tag: CielOperationTag.Plugin,
  },
  ProjectorProject: {
    name: 'ciel.projector.project',
    label: 'Projector Project',
    tag: CielOperationTag.Context,
  },
  SensuCreate: {
    name: 'ciel.sensu.create',
    label: 'Sensu Create',
    tag: CielOperationTag.Sensu,
  },
  SensuInput: {
    name: 'ciel.sensu.input',
    label: 'Sensu Input',
    tag: CielOperationTag.Sensu,
  },
  SensuOutput: {
    name: 'ciel.sensu.output',
    label: 'Sensu Output',
    tag: CielOperationTag.Sensu,
  },
  SensuClose: {
    name: 'ciel.sensu.close',
    label: 'Sensu Close',
    tag: CielOperationTag.Sensu,
  },
  SignalEmit: {
    name: 'ciel.signal.emit',
    label: 'Signal Emit',
    tag: CielOperationTag.Signal,
  },
} as const;

export type CielOperation = (typeof CielOperation)[keyof typeof CielOperation];

export interface CielOperationMetadata {
  readonly capability?: string;
  readonly cueAt?: number;
  readonly cueDefinitionId?: string;
  readonly cueDefinitionName?: string;
  readonly extensionId?: string;
  readonly extensionKind?: string;
  readonly extensionName?: string;
  readonly pluginId?: string;
  readonly pluginName?: string;
  readonly projectorKey?: string;
  readonly projectorName?: string;
  readonly signalDefinitionId?: string;
  readonly signalDefinitionName?: string;
  readonly toolLabel?: string;
  readonly toolName?: string;
}

export type Instrument = import('@ciels/interceptor').Instrument<CielOperationMetadata>;
export type Interceptor = import('@ciels/interceptor').Interceptor<CielOperationMetadata>;
export type { InstrumentContext } from '@ciels/interceptor';

export function cielOperation(
  operation: CielOperation,
  metadata?: Readonly<Partial<CielOperationMetadata>>,
): InstrumentContext<CielOperationMetadata> {
  return {
    ...operation,
    ...(metadata ? { metadata } : {}),
  };
}
