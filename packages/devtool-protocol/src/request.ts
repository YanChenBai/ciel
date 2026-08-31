import type { AgentMessagePage, AgentMessageQuery } from './agent.ts';
import type { DevtoolRequestName } from './capability.ts';
import type { DevtoolProtocolName, DevtoolProtocolVersion } from './constants.ts';
import type { StreamCursor } from './cursor.ts';
import type { EngramPage, EngramQuery, EngramSummary } from './engram.ts';
import type { DevtoolProtocolError } from './error.ts';
import type { OperationPage, OperationQuery, TelemetrySummary } from './operation.ts';
import type { DevtoolSnapshot, RuntimeSnapshot } from './target.ts';

export type EmptyPayload = Readonly<Record<string, never>>;

export interface TargetBootstrapInput {
  readonly after?: StreamCursor;
}

export interface TargetBootstrap {
  readonly cursor: StreamCursor;
  readonly snapshot: DevtoolSnapshot;
}

export interface DevtoolRequestMap {
  readonly 'target.bootstrap': {
    readonly input: TargetBootstrapInput;
    readonly output: TargetBootstrap;
  };
  readonly 'operation.query': {
    readonly input: OperationQuery;
    readonly output: OperationPage;
  };
  readonly 'engram.query': {
    readonly input: EngramQuery;
    readonly output: EngramPage;
  };
  readonly 'agent.message.query': {
    readonly input: AgentMessageQuery;
    readonly output: AgentMessagePage;
  };
  readonly 'runtime.start': {
    readonly input: EmptyPayload;
    readonly output: RuntimeSnapshot;
  };
  readonly 'runtime.stop': {
    readonly input: EmptyPayload;
    readonly output: RuntimeSnapshot;
  };
  readonly 'engram.clear': {
    readonly input: EmptyPayload;
    readonly output: EngramSummary;
  };
  readonly 'telemetry.clear': {
    readonly input: EmptyPayload;
    readonly output: TelemetrySummary;
  };
}

export type DevtoolRequestInput<TName extends DevtoolRequestName> =
  DevtoolRequestMap[TName]['input'];

export type DevtoolRequestOutput<TName extends DevtoolRequestName> =
  DevtoolRequestMap[TName]['output'];

interface DevtoolRequestEnvelopeBase {
  readonly protocol: DevtoolProtocolName;
  readonly version: DevtoolProtocolVersion;
  readonly id: string;
  readonly type: 'request';
}

export type DevtoolRequestOf<TName extends DevtoolRequestName> = DevtoolRequestEnvelopeBase & {
  readonly name: TName;
  readonly payload: DevtoolRequestInput<TName>;
};

export type DevtoolRequest = {
  [TName in DevtoolRequestName]: DevtoolRequestOf<TName>;
}[DevtoolRequestName];

export type DevtoolResponseResult<TName extends DevtoolRequestName> =
  | {
      readonly ok: true;
      readonly value: DevtoolRequestOutput<TName>;
    }
  | {
      readonly ok: false;
      readonly error: DevtoolProtocolError;
    };

interface DevtoolResponseEnvelopeBase {
  readonly protocol: DevtoolProtocolName;
  readonly version: DevtoolProtocolVersion;
  readonly id: string;
  readonly type: 'response';
  readonly requestId: string;
}

export type DevtoolResponseOf<TName extends DevtoolRequestName> = DevtoolResponseEnvelopeBase & {
  readonly name: TName;
  readonly result: DevtoolResponseResult<TName>;
};

export type DevtoolResponse = {
  [TName in DevtoolRequestName]: DevtoolResponseOf<TName>;
}[DevtoolRequestName];
