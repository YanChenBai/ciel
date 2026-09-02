import type { Operation } from 'corex';

import type { JsonValue, ProtocolErrorRecord, SerializedValue } from './value.ts';

export type OperationStatus = 'running' | 'completed' | 'failed';

export type OperationSource =
  | { readonly type: 'core' }
  | {
      readonly type: 'plugin';
      readonly pluginId: string;
      readonly pluginName: string;
    }
  | {
      readonly type: 'custom';
      readonly name: string;
    };

export interface OperationRecord extends Operation {
  readonly id: string;
  readonly parentId?: string;
  readonly source?: OperationSource;
  readonly startedAt: number;
  readonly completedAt?: number;
  readonly durationMs?: number;
  readonly status: OperationStatus;
  readonly attributes: Readonly<Record<string, JsonValue>>;
  readonly input: SerializedValue;
  readonly output: SerializedValue;
  readonly error?: ProtocolErrorRecord;
}

export interface OperationQuery {
  readonly after?: number;
  readonly limit?: number;
  readonly name?: string;
  readonly parentId?: string;
  readonly status?: OperationStatus;
}

export interface OperationPage {
  readonly items: readonly OperationRecord[];
  readonly throughSequence: number;
  readonly next?: number;
}

export interface TelemetrySummary {
  readonly throughSequence: number;
  readonly operations: number;
  readonly activeOperations: number;
  readonly failedOperations: number;
}
