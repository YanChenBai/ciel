export { createInstrumenter } from '@ciels/interceptor';
export type {
  AnyFunction,
  Instrument,
  InstrumentContext,
  InterceptorWrapper,
} from '@ciels/interceptor';

export const CielOperationName = {
  AgentGenerate: 'ciel.agent.generate',
  AgentPrompt: 'ciel.agent.prompt',
  AgentThink: 'ciel.agent.think',
  AgentToolExecute: 'ciel.agent.tool.execute',
  PluginStart: 'ciel.plugin.start',
  ProjectorProject: 'ciel.projector.project',
  Sensu: 'ciel.sensu',
  SignalEmit: 'ciel.signal.emit',
} as const;

export type CielOperationName = (typeof CielOperationName)[keyof typeof CielOperationName];
