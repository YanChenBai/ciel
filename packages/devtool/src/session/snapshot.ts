import type { DevtoolEvent, DevtoolSnapshot } from '@ciels/devtool-protocol';

function removeActiveOperation(snapshot: DevtoolSnapshot, operationId: string) {
  const activeOperations = snapshot.activeOperations.filter(
    operation => operation.id !== operationId,
  );
  return {
    activeOperations,
    removed: activeOperations.length !== snapshot.activeOperations.length,
  };
}

/**
 * 将实时协议事件归并到 bootstrap 快照；不引入 Corex 运行时类型。
 */
export function reduceDevtoolSnapshot(
  snapshot: DevtoolSnapshot,
  event: DevtoolEvent,
): DevtoolSnapshot {
  if (event.name === 'runtime.status.changed') {
    return {
      ...snapshot,
      runtime: { status: event.payload.status, observedAt: event.time },
    };
  }

  if (event.name === 'operation.started') {
    const exists = snapshot.activeOperations.some(
      operation => operation.id === event.payload.operation.id,
    );
    if (exists) return snapshot;
    return {
      ...snapshot,
      telemetry: {
        ...snapshot.telemetry,
        operations: snapshot.telemetry.operations + 1,
        activeOperations: snapshot.telemetry.activeOperations + 1,
      },
      activeOperations: [...snapshot.activeOperations, event.payload.operation],
    };
  }

  if (event.name === 'operation.completed' || event.name === 'operation.failed') {
    const result = removeActiveOperation(snapshot, event.payload.operation.id);
    return {
      ...snapshot,
      telemetry: {
        ...snapshot.telemetry,
        activeOperations: Math.max(
          0,
          snapshot.telemetry.activeOperations - (result.removed ? 1 : 0),
        ),
        failedOperations:
          snapshot.telemetry.failedOperations + (event.name === 'operation.failed' ? 1 : 0),
      },
      activeOperations: result.activeOperations,
    };
  }

  if (event.name === 'engram.appended') {
    return {
      ...snapshot,
      engram: {
        size: snapshot.engram.size + event.payload.entries.length,
        throughSequence: Math.max(
          snapshot.engram.throughSequence,
          event.payload.entries.at(-1)?.sequence ?? snapshot.engram.throughSequence,
        ),
      },
    };
  }

  if (event.name === 'engram.pruned' || event.name === 'engram.cleared') {
    return { ...snapshot, engram: event.payload.summary };
  }

  if (event.name === 'agent.message.appended') {
    return {
      ...snapshot,
      agent: {
        messages: snapshot.agent.messages + event.payload.messages.length,
        throughSequence: Math.max(
          snapshot.agent.throughSequence,
          event.payload.messages.at(-1)?.sequence ?? snapshot.agent.throughSequence,
        ),
      },
    };
  }

  if (event.name === 'agent.messages.reset') {
    return { ...snapshot, agent: event.payload.summary };
  }

  if (event.name === 'target.disposed') {
    return {
      ...snapshot,
      runtime: { status: 'disposed', observedAt: event.time },
      activeOperations: [],
      telemetry: { ...snapshot.telemetry, activeOperations: 0 },
    };
  }

  return snapshot;
}
