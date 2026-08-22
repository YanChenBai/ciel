import type {
  AnyVigiliaEvent,
  VigiliaActiveOperation,
  VigiliaOperationKind,
  VigiliaSnapshot,
} from './types.ts';

export const initialVigiliaSnapshot: VigiliaSnapshot = Object.freeze({
  activeOperations: Object.freeze([]),
  performance: Object.freeze({ archiveDurationMs: 0, signalDurationMs: 0, thinkDurationMs: 0 }),
  state: 'idle',
  throughSequence: 0,
  totals: Object.freeze({
    archives: 0,
    errors: 0,
    inputTokens: 0,
    outputTokens: 0,
    percepts: 0,
    signals: 0,
    thoughts: 0,
  }),
});

/** 将一条已提交事实确定性地归并到面向调试界面的运行时快照。 */
export function reduceVigilia(snapshot: VigiliaSnapshot, event: AnyVigiliaEvent): VigiliaSnapshot {
  let state = snapshot.state;
  let activeOperations = snapshot.activeOperations;
  let latestError = snapshot.latestError;
  const totals = { ...snapshot.totals };
  const performance = { ...snapshot.performance };

  switch (event.type) {
    case 'ciel.state.changed':
      state = event.data.to;
      break;
    case 'signal.processing.started':
      totals.signals += 1;
      activeOperations = addOperation(
        activeOperations,
        event.data.operationId,
        'signal',
        event.time,
      );
      break;
    case 'signal.processing.completed':
      performance.signalDurationMs += event.data.durationMs;
      activeOperations = removeOperation(activeOperations, event.data.operationId);
      break;
    case 'signal.processing.failed':
      totals.errors += 1;
      performance.signalDurationMs += event.data.durationMs;
      activeOperations = removeOperation(activeOperations, event.data.operationId);
      latestError = failure(event.time, 'signal', 'process', event.data.error);
      break;
    case 'percept.appended':
      totals.percepts += 1;
      break;
    case 'nucleus.think.started':
      activeOperations = addOperation(
        activeOperations,
        event.data.operationId,
        'think',
        event.time,
      );
      break;
    case 'nucleus.think.completed':
      totals.thoughts += 1;
      totals.inputTokens += event.data.inputTokens ?? 0;
      totals.outputTokens += event.data.outputTokens ?? 0;
      performance.thinkDurationMs += event.data.durationMs;
      activeOperations = removeOperation(activeOperations, event.data.operationId);
      break;
    case 'nucleus.think.failed':
      totals.errors += 1;
      performance.thinkDurationMs += event.data.durationMs;
      activeOperations = removeOperation(activeOperations, event.data.operationId);
      latestError = failure(event.time, 'nucleus', 'think', event.data.error);
      break;
    case 'memory.archive.started':
      activeOperations = addOperation(
        activeOperations,
        event.data.operationId,
        'archive',
        event.time,
      );
      break;
    case 'memory.archive.completed':
      totals.archives += 1;
      performance.archiveDurationMs += event.data.durationMs;
      activeOperations = removeOperation(activeOperations, event.data.operationId);
      break;
    case 'memory.archive.failed':
      totals.errors += 1;
      performance.archiveDurationMs += event.data.durationMs;
      activeOperations = removeOperation(activeOperations, event.data.operationId);
      latestError = failure(event.time, 'memory', 'archive', event.data.error);
      break;
    case 'operation.started':
      activeOperations = addOperation(
        activeOperations,
        event.data.operationId,
        operationKind(event.data.category, event.data.name),
        event.time,
        event.data.parentOperationId,
        event.data.name,
      );
      break;
    case 'operation.completed':
      activeOperations = removeOperation(activeOperations, event.data.operationId);
      break;
    case 'operation.failed':
      totals.errors += 1;
      activeOperations = removeOperation(activeOperations, event.data.operationId);
      latestError = failure(event.time, event.data.category, event.data.name, event.data.error);
      break;
    case 'error.observed':
      totals.errors += 1;
      latestError = { ...event.data, time: event.time };
      break;
  }

  return Object.freeze({
    activeOperations: Object.freeze(activeOperations),
    ...(latestError ? { latestError: Object.freeze(latestError) } : {}),
    performance: Object.freeze(performance),
    state,
    throughSequence: event.sequence,
    totals: Object.freeze(totals),
  });
}

function addOperation(
  operations: readonly VigiliaActiveOperation[],
  operationId: string,
  kind: VigiliaOperationKind,
  startedAt: number,
  parentOperationId?: string,
  name?: string,
): readonly VigiliaActiveOperation[] {
  // 在 Journal 提交前校验开始/结束配对，避免损坏的调用轨迹进入历史。
  if (operations.some(operation => operation.operationId === operationId)) {
    throw new Error(`Vigilia operation ${operationId} has already started`);
  }
  return [
    ...operations,
    Object.freeze({
      kind,
      operationId,
      ...(parentOperationId ? { parentOperationId } : {}),
      ...(name ? { name } : {}),
      startedAt,
    }),
  ];
}

function operationKind(category: string, name: string): VigiliaOperationKind {
  if (category === 'sensory' && name === 'asr') return 'asr';
  if (category === 'sensory') return 'sensory';
  if (category === 'context') return 'context';
  if (category === 'memory') return 'memory';
  if (category === 'model') return 'model';
  return 'tool';
}

function removeOperation(
  operations: readonly VigiliaActiveOperation[],
  operationId: string,
): readonly VigiliaActiveOperation[] {
  if (!operations.some(operation => operation.operationId === operationId)) {
    throw new Error(`Vigilia operation ${operationId} is not active`);
  }
  return operations.filter(operation => operation.operationId !== operationId);
}

function failure(
  time: number,
  source: string,
  phase: string,
  error: { readonly message: string; readonly name: string; readonly stack?: string },
) {
  return { error, phase, source, time };
}
