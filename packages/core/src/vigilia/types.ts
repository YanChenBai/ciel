export type VigiliaJsonPrimitive = boolean | null | number | string;
export type VigiliaJsonValue =
  | VigiliaJsonPrimitive
  | readonly VigiliaJsonValue[]
  | { readonly [key: string]: VigiliaJsonValue };

export type VigiliaRuntimeState = 'idle' | 'running' | 'starting' | 'stopping';
export type VigiliaOperationKind =
  | 'archive'
  | 'asr'
  | 'context'
  | 'memory'
  | 'model'
  | 'signal'
  | 'sensory'
  | 'think'
  | 'tool';
export type VigiliaObservationCategory = 'context' | 'memory' | 'model' | 'sensory' | 'tool';

export interface VigiliaError {
  readonly message: string;
  readonly name: string;
  readonly stack?: string;
}

/** 稳定的事件契约；每一项都是已经提交的运行时事实，而不是命令。 */
export interface VigiliaEventDataMap {
  readonly 'ciel.state.changed': {
    readonly from: VigiliaRuntimeState;
    readonly to: VigiliaRuntimeState;
  };
  readonly 'error.observed': {
    readonly error: VigiliaError;
    readonly phase: string;
    readonly source: string;
  };
  readonly 'memory.archive.completed': {
    readonly durationMs: number;
    readonly fromSequence: number;
    readonly operationId: string;
    readonly recordCount: number;
    readonly throughSequence: number;
    readonly summary?: VigiliaJsonValue;
  };
  readonly 'memory.archive.failed': {
    readonly durationMs: number;
    readonly error: VigiliaError;
    readonly operationId: string;
  };
  readonly 'memory.archive.started': {
    readonly fromSequence: number;
    readonly operationId: string;
    readonly recordCount: number;
    readonly throughSequence: number;
  };
  readonly 'nucleus.think.completed': {
    readonly durationMs: number;
    readonly inputTokens?: number;
    readonly operationId: string;
    readonly output?: VigiliaJsonValue;
    readonly outputTokens?: number;
    readonly reasoning?: VigiliaJsonValue;
    readonly trigger: string;
  };
  readonly 'nucleus.think.failed': {
    readonly durationMs: number;
    readonly error: VigiliaError;
    readonly operationId: string;
    readonly trigger: string;
  };
  readonly 'nucleus.think.started': {
    readonly fromSequence: number;
    readonly operationId: string;
    readonly throughSequence: number;
    readonly trigger: string;
  };
  readonly 'percept.appended': {
    readonly content?: VigiliaJsonValue;
    readonly perceptType: string;
    readonly sequence: number;
    readonly signal: string;
    readonly stimulus: string;
  };
  readonly 'vision.composed': {
    readonly frameCount: number;
    readonly path: string;
    readonly signal: string;
    readonly stimulus: string;
  };
  readonly 'signal.processing.completed': {
    readonly durationMs: number;
    readonly operationId: string;
    readonly signal: string;
  };
  readonly 'signal.processing.failed': {
    readonly durationMs: number;
    readonly error: VigiliaError;
    readonly operationId: string;
    readonly signal: string;
  };
  readonly 'signal.processing.started': {
    readonly operationId: string;
    readonly signal: string;
  };
  readonly 'operation.completed': {
    readonly category: VigiliaObservationCategory;
    readonly detail?: VigiliaJsonValue;
    readonly durationMs: number;
    readonly name: string;
    readonly operationId: string;
    readonly parentOperationId?: string;
  };
  readonly 'operation.failed': {
    readonly category: VigiliaObservationCategory;
    readonly durationMs: number;
    readonly error: VigiliaError;
    readonly name: string;
    readonly operationId: string;
    readonly parentOperationId?: string;
  };
  readonly 'operation.started': {
    readonly category: VigiliaObservationCategory;
    readonly detail?: VigiliaJsonValue;
    readonly name: string;
    readonly operationId: string;
    readonly parentOperationId?: string;
  };
}

export type VigiliaEventType = keyof VigiliaEventDataMap;

export interface VigiliaEvent<TType extends VigiliaEventType = VigiliaEventType> {
  readonly data: Readonly<VigiliaEventDataMap[TType]>;
  readonly sequence: number;
  readonly time: number;
  readonly type: TType;
  readonly version: 1;
}

export type AnyVigiliaEvent = {
  [TType in VigiliaEventType]: VigiliaEvent<TType>;
}[VigiliaEventType];

export interface VigiliaActiveOperation {
  readonly kind: VigiliaOperationKind;
  readonly operationId: string;
  readonly parentOperationId?: string;
  readonly name?: string;
  readonly startedAt: number;
}

export interface VigiliaTotals {
  readonly archives: number;
  readonly errors: number;
  readonly inputTokens: number;
  readonly outputTokens: number;
  readonly percepts: number;
  readonly signals: number;
  readonly thoughts: number;
}

export interface VigiliaPerformance {
  readonly archiveDurationMs: number;
  readonly signalDurationMs: number;
  readonly thinkDurationMs: number;
}

export interface VigiliaSnapshot {
  readonly activeOperations: readonly VigiliaActiveOperation[];
  readonly latestError?: {
    readonly error: VigiliaError;
    readonly phase: string;
    readonly source: string;
    readonly time: number;
  };
  readonly performance: VigiliaPerformance;
  readonly state: VigiliaRuntimeState;
  readonly throughSequence: number;
  readonly totals: VigiliaTotals;
}

export interface VigiliaEventQuery {
  /** 不包含自身的事件 sequence 游标。 */
  readonly after?: number;
  readonly limit?: number;
}

export type VigiliaSubscriber = (event: AnyVigiliaEvent, snapshot: VigiliaSnapshot) => void;
