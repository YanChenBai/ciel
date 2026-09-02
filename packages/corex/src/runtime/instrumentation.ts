import type { InstrumentContext } from '@cieljs/instrument';

import type { Operation } from './operation.ts';

export { createInstrumenter } from '@cieljs/instrument';
export type { AnyFunction, InstrumentPreset, InterceptorWrapper } from '@cieljs/instrument';

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
  CueSubmit: {
    name: 'ciel.cue.submit',
    label: 'Cue Submit',
    tag: CielOperationTag.Cue,
  },
  AgentRun: {
    name: 'ciel.agent.run',
    label: 'Agent Run',
    tag: CielOperationTag.Agent,
  },
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
  PluginConfigResolved: {
    name: 'ciel.plugin.config-resolved',
    label: 'Plugin Config Resolved',
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
  SignalDispatch: {
    name: 'ciel.signal.dispatch',
    label: 'Signal Dispatch',
    tag: CielOperationTag.Signal,
  },
} as const satisfies Readonly<Record<string, Operation>>;

export type CielOperation = (typeof CielOperation)[keyof typeof CielOperation];
export type CielOperationName = CielOperation['name'];

export interface CielOperationMetadata {
  readonly label: string;
  readonly tag: string;
  readonly capability?: string;
  readonly cueAt?: number;
  readonly cueDefinitionId?: string;
  readonly cueDefinitionName?: string;
  readonly pluginId?: string;
  readonly pluginName?: string;
  readonly projectorId?: string;
  readonly projectorKey?: string;
  readonly projectorName?: string;
  readonly signalDefinitionId?: string;
  readonly signalDefinitionName?: string;
  readonly sensuId?: string;
  readonly sensuName?: string;
  readonly toolLabel?: string;
  readonly toolName?: string;
}

export type Instrument = import('@cieljs/instrument').Instrument<CielOperationMetadata>;
export type Interceptor = import('@cieljs/instrument').Interceptor<CielOperationMetadata>;
export type { InstrumentContext } from '@cieljs/instrument';

export function cielOperation(
  operation: Operation,
  metadata?: Readonly<Partial<Omit<CielOperationMetadata, 'label' | 'tag'>>>,
): InstrumentContext<CielOperationMetadata> {
  return {
    name: operation.name,
    metadata: {
      ...metadata,
      label: operation.label,
      tag: operation.tag,
    },
  };
}
