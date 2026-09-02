import {
  DevtoolEventName,
  type AgentMessageRecord,
  type EngramEntryRecord,
  type OperationRecord,
  type SerializedValue,
} from '@ciels/devtool-protocol';
import type { AgentMessage, Ciel, EngramEntry } from 'corex';

import type { DevtoolTarget, DevtoolTargetEvent } from '../bridge/index.ts';
import type { Telemetry, TelemetryEvent } from '../types.ts';

interface CreateCielTargetOptions {
  readonly ciel: Ciel;
  readonly description?: string;
  readonly name: string;
  readonly telemetry: Telemetry;
}

export function createCielTarget(options: CreateCielTargetOptions): DevtoolTarget {
  const { ciel, telemetry } = options;
  const operations = new Map<string, OperationRecord>();
  const subscribers = new Set<(event: DevtoolTargetEvent) => PromiseLike<void> | void>();
  let engramSequence = -1;
  let messageSequence = -1;
  let stopTelemetry: (() => void) | undefined;

  function publish(event: DevtoolTargetEvent): void {
    for (const subscriber of subscribers) {
      void Promise.resolve(subscriber(event)).catch(() => undefined);
    }
  }

  function syncRecords(time: number): void {
    const entries = ciel.engram.all();
    if (engramSequence >= 0 && !entries.some(entry => entry.sequence === engramSequence)) {
      engramSequence = -1;
      publish({
        name: DevtoolEventName.EngramCleared,
        time,
        payload: { summary: { size: 0, throughSequence: 0 } },
      });
    }

    const appendedEntries = entries
      .filter(entry => entry.sequence > engramSequence)
      .map(engramRecord);
    if (appendedEntries.length > 0) {
      engramSequence = appendedEntries.at(-1)?.sequence ?? engramSequence;
      publish({
        name: DevtoolEventName.EngramAppended,
        time,
        payload: { entries: appendedEntries },
      });
    }

    const messages = ciel.messages;
    if (messageSequence >= messages.length) {
      messageSequence = -1;
      publish({
        name: DevtoolEventName.AgentMessagesReset,
        time,
        payload: { summary: { messages: 0, throughSequence: 0 } },
      });
    }

    const appendedMessages = messages
      .map(messageRecord)
      .filter(message => message.sequence > messageSequence);
    if (appendedMessages.length > 0) {
      messageSequence = appendedMessages.at(-1)?.sequence ?? messageSequence;
      publish({
        name: DevtoolEventName.AgentMessageAppended,
        time,
        payload: { messages: appendedMessages },
      });
    }
  }

  function onTelemetry(event: TelemetryEvent): void {
    const operation = updateOperation(operations, event, telemetry);
    publish({ name: event.type, time: event.time, payload: { operation } } as DevtoolTargetEvent);
    syncRecords(event.time);
  }

  function operationValues(): readonly OperationRecord[] {
    const restored = new Map<string, OperationRecord>();
    for (const event of telemetry.events()) updateOperation(restored, event, telemetry);
    operations.clear();
    for (const [id, operation] of restored) operations.set(id, operation);
    return [...operations.values()];
  }

  return {
    descriptor: {
      id: ciel.id,
      name: options.name,
      ...(options.description ? { description: options.description } : {}),
    },
    events: [
      DevtoolEventName.OperationStarted,
      DevtoolEventName.OperationCompleted,
      DevtoolEventName.OperationFailed,
      DevtoolEventName.EngramAppended,
      DevtoolEventName.EngramCleared,
      DevtoolEventName.AgentMessageAppended,
      DevtoolEventName.AgentMessagesReset,
    ],
    snapshot() {
      const entries = ciel.engram.all();
      const messages = ciel.messages;
      const values = operationValues();
      return {
        runtime: { status: ciel.status, observedAt: Date.now() },
        telemetry: summary(values, telemetry),
        engram: { size: entries.length, throughSequence: entries.at(-1)?.sequence ?? 0 },
        agent: { messages: messages.length, throughSequence: Math.max(0, messages.length - 1) },
        activeOperations: values.filter(item => item.status === 'running'),
      };
    },
    requests: {
      'operation.query': input => {
        const filtered = operationValues()
          .filter(item => input.after === undefined || item.startedAt > input.after)
          .filter(item => input.name === undefined || item.name === input.name)
          .filter(item => input.parentId === undefined || item.parentId === input.parentId)
          .filter(item => input.status === undefined || item.status === input.status);
        return {
          items: filtered.slice(-(input.limit ?? 100)),
          throughSequence: telemetry.throughSequence,
        };
      },
      'engram.query': input => {
        const entries = ciel.engram.all();
        const filtered = entries
          .filter(item => input.after === undefined || item.sequence > input.after)
          .filter(item => input.through === undefined || item.sequence <= input.through)
          .filter(
            item =>
              input.definitionId === undefined || item.value.definition.id === input.definitionId,
          );
        return {
          items: filtered.slice(-(input.limit ?? 100)).map(engramRecord),
          throughSequence: entries.at(-1)?.sequence ?? 0,
        };
      },
      'agent.message.query': input => {
        const messages = ciel.messages.map(messageRecord);
        const filtered = messages
          .filter(item => input.after === undefined || item.sequence > input.after)
          .filter(item => input.role === undefined || item.role === input.role);
        return {
          items: filtered.slice(-(input.limit ?? 100)),
          throughSequence: messages.at(-1)?.sequence ?? 0,
        };
      },
      'runtime.stop': () => {
        queueMicrotask(() => void ciel.stop().catch(() => undefined));
        return { status: 'stopping', observedAt: Date.now() };
      },
      'engram.clear': () => {
        ciel.engram.clear();
        engramSequence = -1;
        const result = { size: 0, throughSequence: 0 };
        publish({
          name: DevtoolEventName.EngramCleared,
          time: Date.now(),
          payload: { summary: result },
        });
        return result;
      },
      'telemetry.clear': () => {
        telemetry.clear();
        operations.clear();
        return summary([], telemetry);
      },
    },
    subscribe(subscriber) {
      if (subscribers.size === 0) stopTelemetry = telemetry.subscribe(onTelemetry);
      subscribers.add(subscriber);
      return () => {
        subscribers.delete(subscriber);
        if (subscribers.size === 0) {
          stopTelemetry?.();
          stopTelemetry = undefined;
        }
      };
    },
  };
}

function updateOperation(
  map: Map<string, OperationRecord>,
  event: TelemetryEvent,
  telemetry: Telemetry,
): OperationRecord {
  const current = map.get(event.operation.id) ?? {
    id: event.operation.id,
    ...(event.operation.parentOperationId ? { parentId: event.operation.parentOperationId } : {}),
    label: event.operation.label,
    name: event.operation.name,
    tag: event.operation.tag,
    startedAt: event.time,
    status: 'running' as const,
    attributes: attributes(event.operation.metadata),
    input: event.type === 'operation.started' ? captured(event.input, telemetry) : omitted(),
    output: pending(),
  };
  const value: OperationRecord =
    event.type === 'operation.started'
      ? current
      : event.type === 'operation.completed'
        ? {
            ...current,
            completedAt: event.time,
            durationMs: event.durationMs,
            status: 'completed',
            output: captured(event.output, telemetry),
          }
        : {
            ...current,
            completedAt: event.time,
            durationMs: event.durationMs,
            status: 'failed',
            error: event.error,
          };
  map.set(value.id, value);
  return value;
}

function attributes(metadata: Readonly<Record<string, unknown>> | undefined) {
  return Object.fromEntries(
    Object.entries(metadata ?? {}).flatMap(([key, value]) =>
      value === null ||
      typeof value === 'string' ||
      typeof value === 'number' ||
      typeof value === 'boolean'
        ? [[key, value]]
        : [],
    ),
  );
}

function summary(values: readonly OperationRecord[], telemetry: Telemetry) {
  return {
    throughSequence: telemetry.throughSequence,
    operations: values.length,
    activeOperations: values.filter(item => item.status === 'running').length,
    failedOperations: values.filter(item => item.status === 'failed').length,
  };
}

function engramRecord(entry: EngramEntry): EngramEntryRecord {
  const percept = entry.value;
  return {
    sequence: entry.sequence,
    recordedAt: entry.recordedAt,
    percept: {
      definition: descriptor(percept.definition),
      source: {
        definition: descriptor(percept.origin),
        temporal: percept.temporal,
        payload: omitted(),
      },
      temporal: percept.temporal,
      contents: serialized(percept.contents),
      ...(percept.confidence === undefined ? {} : { confidence: percept.confidence }),
    },
  };
}

function descriptor(value: { id: string; type: string; name: string; description?: string }) {
  return {
    id: value.id,
    type: value.type,
    name: value.name,
    ...(value.description ? { description: value.description } : {}),
  };
}

function messageRecord(message: AgentMessage, sequence: number): AgentMessageRecord {
  const rawRole = message.role === 'toolResult' ? 'tool' : message.role;
  const role =
    rawRole === 'user' || rawRole === 'assistant' || rawRole === 'tool' ? rawRole : 'custom';
  return {
    id: String(sequence),
    sequence,
    role,
    ...('timestamp' in message && typeof message.timestamp === 'number'
      ? { time: message.timestamp }
      : {}),
    content: serialized('content' in message ? message.content : message),
  };
}

function captured(data: string | undefined, telemetry: Telemetry): SerializedValue {
  if (data === undefined) return omitted();
  try {
    return serialized(telemetry.deserialize(data));
  } catch (error) {
    return serializationError('DeserializationError', error);
  }
}

function serialized(value: unknown): SerializedValue {
  try {
    const data = JSON.stringify(value);
    return data === undefined
      ? omitted()
      : { type: 'serialized', encoding: 'json', data, preview: data.slice(0, 200) };
  } catch (error) {
    return serializationError('SerializationError', error);
  }
}

function serializationError(name: string, error: unknown): SerializedValue {
  return {
    type: 'serialization-error',
    error: { name, message: error instanceof Error ? error.message : String(error) },
  };
}

function omitted(): SerializedValue {
  return { type: 'omitted', reason: 'capture-disabled' };
}

function pending(): SerializedValue {
  return { type: 'omitted', reason: 'pending' };
}
