export type VigiliaObservationCategory = 'context' | 'memory' | 'model' | 'sensory' | 'tool';

export interface VigiliaObservationDataMap {
  readonly 'ciel.state.changed': {
    readonly from: 'idle' | 'running' | 'starting' | 'stopping';
    readonly to: 'idle' | 'running' | 'starting' | 'stopping';
  };
  readonly 'error.observed': {
    readonly error: unknown;
    readonly phase: string;
    readonly source: string;
  };
  readonly 'memory.archive.completed': {
    readonly durationMs: number;
    readonly fromSequence: number;
    readonly operationId: string;
    readonly recordCount: number;
    readonly summary?: unknown;
    readonly throughSequence: number;
  };
  readonly 'memory.archive.failed': {
    readonly durationMs: number;
    readonly error: unknown;
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
    readonly name?: string;
    readonly operationId: string;
    readonly output?: unknown;
    readonly outputTokens?: number;
    readonly reasoning?: unknown;
    readonly trigger: string;
  };
  readonly 'nucleus.think.failed': {
    readonly durationMs: number;
    readonly error: unknown;
    readonly name?: string;
    readonly operationId: string;
    readonly trigger: string;
  };
  readonly 'nucleus.think.started': {
    readonly fromSequence: number;
    readonly name?: string;
    readonly operationId: string;
    readonly throughSequence: number;
    readonly trigger: string;
  };
  readonly 'operation.completed': {
    readonly category: VigiliaObservationCategory;
    readonly durationMs: number;
    readonly name: string;
    readonly operationId: string;
    readonly parentOperationId?: string;
    readonly result?: unknown;
  };
  readonly 'operation.failed': {
    readonly category: VigiliaObservationCategory;
    readonly durationMs: number;
    readonly error: unknown;
    readonly name: string;
    readonly operationId: string;
    readonly parentOperationId?: string;
  };
  readonly 'operation.started': {
    readonly category: VigiliaObservationCategory;
    readonly detail?: unknown;
    readonly name: string;
    readonly operationId: string;
    readonly parentOperationId?: string;
  };
  readonly 'percept.appended': {
    readonly content: unknown;
    readonly endAt: number;
    readonly perceptType: string;
    readonly sequence: number;
    readonly signal: string;
    readonly startAt: number;
    readonly stimulus: string;
  };
  readonly 'signal.processing.completed': {
    readonly durationMs: number;
    readonly operationId: string;
    readonly signal: string;
  };
  readonly 'signal.processing.failed': {
    readonly durationMs: number;
    readonly error: unknown;
    readonly operationId: string;
    readonly signal: string;
  };
  readonly 'signal.processing.started': {
    readonly operationId: string;
    readonly signal: string;
  };
  readonly 'vision.composed': {
    readonly frameCount: number;
    readonly path: string;
    readonly signal: string;
    readonly stimulus: string;
  };
}

export type VigiliaObservationType = keyof VigiliaObservationDataMap;

export type VigiliaObservation = {
  [Type in VigiliaObservationType]: {
    readonly data: Readonly<VigiliaObservationDataMap[Type]>;
    readonly type: Type;
  };
}[VigiliaObservationType];

export type VigiliaObservationSubscriber = (observation: VigiliaObservation) => void;

export interface VigiliaSource {
  subscribe(subscriber: VigiliaObservationSubscriber): () => void;
}

export interface VigiliaSink {
  observe(observation: VigiliaObservation): void;
}

export interface VigiliaObservable {
  readonly observations: VigiliaSource;
}
