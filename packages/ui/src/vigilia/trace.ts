import type { AnyVigiliaEvent, VigiliaObservationCategory } from '@ciels/core';

export type VigiliaStepLane = 'context' | 'memory' | 'model' | 'nucleus' | 'sensory' | 'tool';
export type VigiliaStepStatus = 'completed' | 'failed' | 'running';

export interface VigiliaStep {
  readonly completedAt?: number;
  readonly durationMs?: number;
  readonly events: readonly AnyVigiliaEvent[];
  readonly id: string;
  readonly input?: unknown;
  readonly lane: VigiliaStepLane;
  readonly name: string;
  readonly output?: unknown;
  readonly parentId?: string;
  readonly startedAt: number;
  readonly status: VigiliaStepStatus;
}

export interface VigiliaThoughtRun {
  readonly completedAt?: number;
  readonly durationMs?: number;
  readonly id: string;
  readonly startedAt: number;
  readonly status: VigiliaStepStatus;
  readonly steps: readonly VigiliaStep[];
  readonly trigger: string;
}

export function buildVigiliaThoughtRuns(
  events: readonly AnyVigiliaEvent[],
): readonly VigiliaThoughtRun[] {
  const starts = events.filter(event => event.type === 'nucleus.think.started');

  return starts.map(start => {
    const operationId = start.data.operationId;
    const related = events.filter(event => operationIdOf(event) === operationId);
    const settlement = related.find(
      event => event.type === 'nucleus.think.completed' || event.type === 'nucleus.think.failed',
    );
    const childStarts = events.filter(
      (event): event is Extract<AnyVigiliaEvent, { type: 'operation.started' }> =>
        event.type === 'operation.started' && event.data.parentOperationId === operationId,
    );
    const steps: VigiliaStep[] = [
      createRootStep(start, settlement),
      ...childStarts.map(childStart => createOperationStep(childStart, events)),
    ];

    return {
      ...(settlement
        ? { completedAt: settlement.time, durationMs: settlement.data.durationMs }
        : {}),
      id: operationId,
      startedAt: start.time,
      status:
        settlement?.type === 'nucleus.think.failed'
          ? 'failed'
          : settlement
            ? 'completed'
            : 'running',
      steps: steps.sort((left, right) => left.startedAt - right.startedAt),
      trigger: start.data.trigger,
    };
  });
}

function createRootStep(
  start: Extract<AnyVigiliaEvent, { type: 'nucleus.think.started' }>,
  settlement: AnyVigiliaEvent | undefined,
): VigiliaStep {
  const completed =
    settlement?.type === 'nucleus.think.completed' || settlement?.type === 'nucleus.think.failed'
      ? settlement
      : undefined;

  return {
    ...(completed ? { completedAt: completed.time, durationMs: completed.data.durationMs } : {}),
    events: completed ? [start, completed] : [start],
    id: start.data.operationId,
    lane: 'nucleus',
    name: `think · ${start.data.trigger}`,
    ...(completed?.type === 'nucleus.think.completed'
      ? {
          output: {
            output: completed.data.output,
            reasoning: completed.data.reasoning,
            usage: {
              inputTokens: completed.data.inputTokens,
              outputTokens: completed.data.outputTokens,
            },
          },
        }
      : completed?.type === 'nucleus.think.failed'
        ? { output: completed.data.error }
        : {}),
    startedAt: start.time,
    status:
      completed?.type === 'nucleus.think.failed' ? 'failed' : completed ? 'completed' : 'running',
  };
}

function createOperationStep(
  start: Extract<AnyVigiliaEvent, { type: 'operation.started' }>,
  events: readonly AnyVigiliaEvent[],
): VigiliaStep {
  const settlement = events.find(
    event =>
      (event.type === 'operation.completed' || event.type === 'operation.failed') &&
      event.data.operationId === start.data.operationId,
  );
  const completed =
    settlement?.type === 'operation.completed' || settlement?.type === 'operation.failed'
      ? settlement
      : undefined;

  return {
    ...(completed ? { completedAt: completed.time, durationMs: completed.data.durationMs } : {}),
    events: completed ? [start, completed] : [start],
    id: start.data.operationId,
    ...(start.data.detail === undefined ? {} : { input: start.data.detail }),
    lane: laneFor(start.data.category),
    name: start.data.name,
    ...(completed?.type === 'operation.completed'
      ? { output: completed.data.detail }
      : completed?.type === 'operation.failed'
        ? { output: completed.data.error }
        : {}),
    ...(start.data.parentOperationId ? { parentId: start.data.parentOperationId } : {}),
    startedAt: start.time,
    status: completed?.type === 'operation.failed' ? 'failed' : completed ? 'completed' : 'running',
  };
}

function laneFor(category: VigiliaObservationCategory): VigiliaStepLane {
  return category;
}

function operationIdOf(event: AnyVigiliaEvent): string | undefined {
  return 'operationId' in event.data ? event.data.operationId : undefined;
}
