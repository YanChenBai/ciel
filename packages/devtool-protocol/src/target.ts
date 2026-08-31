import type { AgentSummary } from './agent.ts';
import type { EngramSummary } from './engram.ts';
import type { OperationRecord, TelemetrySummary } from './operation.ts';

export type RuntimeStatus = 'idle' | 'starting' | 'running' | 'stopping' | 'failed' | 'disposed';

export interface TargetDescriptor {
  readonly id: string;
  readonly sessionId?: string;
  readonly name: string;
  readonly description?: string;
}

export interface RuntimeSnapshot {
  readonly status: RuntimeStatus;
  readonly observedAt: number;
}

export interface DevtoolSnapshot {
  readonly runtime: RuntimeSnapshot;
  readonly telemetry: TelemetrySummary;
  readonly engram: EngramSummary;
  readonly agent: AgentSummary;
  readonly activeOperations: readonly OperationRecord[];
}
