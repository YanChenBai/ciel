import type { OperationRecord } from '@ciels/devtool-protocol';

export interface DevtoolTraceLane {
  readonly id: string;
  readonly label: string;
}

export interface DevtoolTraceEntry {
  readonly color?: string;
  readonly match: string | ((operation: OperationRecord) => boolean);
  readonly type?: 'point' | 'range';
}

export interface ResolvedTraceEntry {
  readonly color: string;
  readonly label: string;
  readonly lane: DevtoolTraceLane;
  readonly type: 'point' | 'range';
}

const fallbackColor = '#64748b';

export const defaultTrace: readonly DevtoolTraceEntry[] = [
  { match: 'ciel.cue.submit', color: '#94a3b8', type: 'point' },
  { match: 'ciel.agent.run', color: 'var(--trace-model)' },
  { match: 'ciel.agent.prompt', color: 'var(--trace-context)' },
  { match: 'ciel.model.generate', color: 'var(--trace-model)' },
  { match: 'ciel.tool.execute', color: 'var(--trace-tool)' },
];

export function resolveTraceEntry(
  operation: OperationRecord,
  trace: readonly DevtoolTraceEntry[],
): ResolvedTraceEntry | undefined {
  const entry = trace.find(candidate =>
    typeof candidate.match === 'string'
      ? operation.name === candidate.match
      : candidate.match(operation),
  );
  if (!entry) return;

  return {
    color: entry.color ?? fallbackColor,
    label: operation.label,
    lane: operationLane(operation),
    type: entry.type ?? 'range',
  };
}

export function operationLabel(operation: OperationRecord): string {
  return operation.label;
}

export function operationLane(operation: OperationRecord): DevtoolTraceLane {
  return {
    id: operation.tag.toLocaleLowerCase(),
    label: operation.tag,
  };
}

export function operationTag(operation: OperationRecord): string {
  return operation.tag;
}

export function operationColor(
  operation: OperationRecord,
  trace: readonly DevtoolTraceEntry[],
): string {
  return resolveTraceEntry(operation, trace)?.color ?? fallbackColor;
}

export function traceLanes(operations: readonly OperationRecord[]): readonly DevtoolTraceLane[] {
  return [
    ...new Map(
      operations.map(operation => {
        const lane = operationLane(operation);
        return [lane.id, lane] as const;
      }),
    ).values(),
  ];
}
