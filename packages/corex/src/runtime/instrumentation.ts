export { createInstrumenter } from '@ciels/interceptor';
export type {
  AnyFunction,
  Instrument,
  InstrumentContext,
  InstrumentPreset,
  InterceptorWrapper,
} from '@ciels/interceptor';

export const CielOperationName = {
  AgentGenerate: 'ciel.agent.generate',
  AgentPrompt: 'ciel.agent.prompt',
  AgentThink: 'ciel.agent.think',
  AgentToolExecute: 'ciel.agent.tool.execute',
  PluginCreate: 'ciel.plugin.create',
  PluginInitialize: 'ciel.plugin.initialize',
  PluginActivate: 'ciel.plugin.activate',
  PluginDeactivate: 'ciel.plugin.deactivate',
  PluginDispose: 'ciel.plugin.dispose',
  ProjectorProject: 'ciel.projector.project',
  SensuCreate: 'ciel.sensu.create',
  SensuInput: 'ciel.sensu.input',
  SensuOutput: 'ciel.sensu.output',
  SensuClose: 'ciel.sensu.close',
  SignalEmit: 'ciel.signal.emit',
} as const;

export type CielOperationName = (typeof CielOperationName)[keyof typeof CielOperationName];

export const CielOperationCategoryAttribute = 'ciel.operation.category';

export type CielOperationCategory = 'agent' | 'plugin' | 'projector' | 'sensu' | 'signal' | 'tool';

const operationCategories: Readonly<Record<CielOperationName, CielOperationCategory>> = {
  [CielOperationName.AgentGenerate]: 'agent',
  [CielOperationName.AgentPrompt]: 'agent',
  [CielOperationName.AgentThink]: 'agent',
  [CielOperationName.AgentToolExecute]: 'tool',
  [CielOperationName.PluginCreate]: 'plugin',
  [CielOperationName.PluginInitialize]: 'plugin',
  [CielOperationName.PluginActivate]: 'plugin',
  [CielOperationName.PluginDeactivate]: 'plugin',
  [CielOperationName.PluginDispose]: 'plugin',
  [CielOperationName.ProjectorProject]: 'projector',
  [CielOperationName.SensuCreate]: 'sensu',
  [CielOperationName.SensuInput]: 'sensu',
  [CielOperationName.SensuOutput]: 'sensu',
  [CielOperationName.SensuClose]: 'sensu',
  [CielOperationName.SignalEmit]: 'signal',
};

export function cielOperation(
  name: CielOperationName,
  metadata: Readonly<Record<string, unknown>> = {},
) {
  return {
    name,
    metadata: {
      ...metadata,
      [CielOperationCategoryAttribute]: operationCategories[name],
    },
  };
}
