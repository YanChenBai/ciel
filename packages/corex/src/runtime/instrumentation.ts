export const CielOperationName = {
  CueEmit: 'ciel.cue.emit',
  CueHandle: 'ciel.cue.handle',
  NoesisSetup: 'ciel.noesis.setup',
  ProjectorProject: 'ciel.projector.project',
  SensuInterpret: 'ciel.sensu.interpret',
  SensuSetup: 'ciel.sensu.setup',
  SignalEmit: 'ciel.signal.emit',
  StimulusSetup: 'ciel.stimulus.setup',
} as const;

export type CielOperationName = (typeof CielOperationName)[keyof typeof CielOperationName];
