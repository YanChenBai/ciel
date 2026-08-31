import type { AgentMessageRecord, AgentSummary } from './agent.ts';
import type { DevtoolEventName } from './capability.ts';
import type { DevtoolProtocolName, DevtoolProtocolVersion } from './constants.ts';
import type { StreamCursor } from './cursor.ts';
import type { EngramEntryRecord, EngramSummary } from './engram.ts';
import type { OperationRecord } from './operation.ts';
import type { RuntimeStatus } from './target.ts';

export interface DevtoolEventMap {
  readonly 'runtime.status.changed': {
    readonly status: RuntimeStatus;
    readonly previous?: RuntimeStatus;
  };
  readonly 'operation.started': {
    readonly operation: OperationRecord;
  };
  readonly 'operation.completed': {
    readonly operation: OperationRecord;
  };
  readonly 'operation.failed': {
    readonly operation: OperationRecord;
  };
  readonly 'engram.appended': {
    readonly entries: readonly EngramEntryRecord[];
  };
  readonly 'engram.pruned': {
    readonly removed: number;
    readonly summary: EngramSummary;
  };
  readonly 'engram.cleared': {
    readonly summary: EngramSummary;
  };
  readonly 'agent.message.appended': {
    readonly messages: readonly AgentMessageRecord[];
  };
  readonly 'agent.messages.reset': {
    readonly summary: AgentSummary;
  };
  readonly 'target.disposed': {
    readonly reason?: string;
  };
}

export type DevtoolEventPayload<TName extends DevtoolEventName> = DevtoolEventMap[TName];

interface DevtoolEventEnvelopeBase {
  readonly protocol: DevtoolProtocolName;
  readonly version: DevtoolProtocolVersion;
  readonly id: string;
  readonly type: 'event';
  readonly cursor: StreamCursor;
  readonly time: number;
}

export type DevtoolEventOf<TName extends DevtoolEventName> = DevtoolEventEnvelopeBase & {
  readonly name: TName;
  readonly payload: DevtoolEventPayload<TName>;
};

export type DevtoolEvent = {
  [TName in DevtoolEventName]: DevtoolEventOf<TName>;
}[DevtoolEventName];
