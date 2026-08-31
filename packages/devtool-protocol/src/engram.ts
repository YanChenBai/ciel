import type { SerializedValue } from './value.ts';

export type Temporal =
  | {
      readonly kind: 'instant';
      readonly at: number;
    }
  | {
      readonly kind: 'interval';
      readonly start: number;
      readonly end: number;
    };

export interface DefinitionDescriptor {
  readonly id: string;
  readonly type: string;
  readonly name: string;
  readonly description?: string;
}

export interface SignalRecord {
  readonly definition: DefinitionDescriptor;
  readonly temporal: Temporal;
  readonly payload: SerializedValue;
}

export interface PerceptRecord {
  readonly definition: DefinitionDescriptor;
  readonly source: SignalRecord;
  readonly temporal: Temporal;
  readonly contents: SerializedValue;
  readonly confidence?: number;
}

export interface EngramEntryRecord {
  readonly sequence: number;
  readonly recordedAt: number;
  readonly percept: PerceptRecord;
}

export interface EngramSummary {
  readonly size: number;
  readonly throughSequence: number;
}

export interface EngramQuery {
  readonly after?: number;
  readonly through?: number;
  readonly limit?: number;
  readonly definitionId?: string;
}

export interface EngramPage {
  readonly items: readonly EngramEntryRecord[];
  readonly throughSequence: number;
  readonly next?: number;
}
