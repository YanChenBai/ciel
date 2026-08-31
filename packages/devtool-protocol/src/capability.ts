export const DevtoolRequestName = {
  TargetBootstrap: 'target.bootstrap',
  OperationQuery: 'operation.query',
  EngramQuery: 'engram.query',
  AgentMessageQuery: 'agent.message.query',
  RuntimeStart: 'runtime.start',
  RuntimeStop: 'runtime.stop',
  EngramClear: 'engram.clear',
  TelemetryClear: 'telemetry.clear',
} as const;

export type DevtoolRequestName = (typeof DevtoolRequestName)[keyof typeof DevtoolRequestName];

export const DevtoolEventName = {
  RuntimeStatusChanged: 'runtime.status.changed',
  OperationStarted: 'operation.started',
  OperationCompleted: 'operation.completed',
  OperationFailed: 'operation.failed',
  EngramAppended: 'engram.appended',
  EngramPruned: 'engram.pruned',
  EngramCleared: 'engram.cleared',
  AgentMessageAppended: 'agent.message.appended',
  AgentMessagesReset: 'agent.messages.reset',
  TargetDisposed: 'target.disposed',
} as const;

export type DevtoolEventName = (typeof DevtoolEventName)[keyof typeof DevtoolEventName];

export interface DevtoolCapabilities {
  readonly requests: readonly DevtoolRequestName[];
  readonly events: readonly DevtoolEventName[];
  readonly features: {
    readonly resume: boolean;
    readonly assets: boolean;
    readonly runtimeControl: boolean;
  };
}
