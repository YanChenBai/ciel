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
