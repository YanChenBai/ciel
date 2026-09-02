// @env node

import { defineTransformer, telemetry } from '@ciels/devtool';
import type { DevtoolTarget, DevtoolTargetEvent, TelemetryEvent } from '@ciels/devtool';
import type {
  AgentMessageRecord,
  EngramEntryRecord,
  OperationRecord,
  SerializedValue,
} from '@ciels/devtool-protocol';
import { DevtoolEventName } from '@ciels/devtool-protocol';
import type { AgentMessage } from '@earendil-works/pi-agent-core';
import type { EngramEntry } from 'corex';

import type { RuntimeController } from './runtime.ts';

export const devtoolTransformers = [
  defineTransformer<unknown, string>({
    name: 'watch-blive.binary-summary',
    isApplicable: (value): value is unknown => isBinary(value),
    serialize: binarySummary,
    deserialize: value => value,
  }),
  defineTransformer<unknown, Readonly<Record<string, unknown>>>({
    name: 'watch-blive.media-summary',
    isApplicable: (value): value is unknown => isLargeMediaContent(value),
    serialize: summarizeMediaContent,
    deserialize: value => value,
  }),
] as const;

export function createRuntimeTarget(controller: RuntimeController): DevtoolTarget {
  const operations = new Map<string, OperationRecord>();
  const subscribers = new Set<(event: DevtoolTargetEvent) => PromiseLike<void> | void>();
  let engramSequence = -1;
  let messageSequence = -1;
  let runtime = controller.runtime;
  let runtimeStatus = runtime?.status ?? 'idle';
  let stopTelemetry: (() => void) | undefined;

  const publish = (event: DevtoolTargetEvent): void => {
    for (const subscriber of subscribers) void Promise.resolve(subscriber(event)).catch(() => {});
  };

  const syncRecords = (time: number): void => {
    const currentEntries = controller.runtime?.engram.all() ?? [];

    if (engramSequence >= 0 && !currentEntries.some(entry => entry.sequence === engramSequence)) {
      engramSequence = -1;
      publish({
        name: DevtoolEventName.EngramCleared,
        time,
        payload: { summary: { size: 0, throughSequence: 0 } },
      });
    }

    const entries = currentEntries
      .filter(entry => entry.sequence > engramSequence)
      .map(engramRecord);

    if (entries?.length) {
      engramSequence = entries.at(-1)?.sequence ?? engramSequence;
      publish({ name: DevtoolEventName.EngramAppended, time, payload: { entries } });
    }

    const currentMessages = controller.runtime?.messages ?? [];

    if (messageSequence >= currentMessages.length) {
      messageSequence = -1;
      publish({
        name: DevtoolEventName.AgentMessagesReset,
        time,
        payload: { summary: { messages: 0, throughSequence: 0 } },
      });
    }

    const messages = currentMessages
      .map(messageRecord)
      .filter(message => message.sequence > messageSequence);
    if (messages.length) {
      messageSequence = messages.at(-1)?.sequence ?? messageSequence;
      publish({ name: DevtoolEventName.AgentMessageAppended, time, payload: { messages } });
    }
  };

  const onTelemetry = (event: TelemetryEvent): void => {
    const operation = updateOperation(operations, event);
    publish({ name: event.type, time: event.time, payload: { operation } } as DevtoolTargetEvent);
    syncRecords(event.time);
  };

  const operationValues = (): readonly OperationRecord[] => {
    const restored = new Map<string, OperationRecord>();
    for (const event of telemetry.events()) updateOperation(restored, event);
    operations.clear();
    for (const [id, operation] of restored) operations.set(id, operation);
    return [...operations.values()];
  };

  const onState = (): void => {
    const nextRuntime = controller.runtime;
    const nextStatus = nextRuntime?.status ?? 'idle';
    if (nextRuntime !== runtime) {
      runtime = nextRuntime;
      engramSequence = -1;
      messageSequence = -1;
      publish({
        name: DevtoolEventName.EngramCleared,
        time: Date.now(),
        payload: { summary: { size: 0, throughSequence: 0 } },
      });
      publish({
        name: DevtoolEventName.AgentMessagesReset,
        time: Date.now(),
        payload: { summary: { messages: 0, throughSequence: 0 } },
      });
    }
    if (nextStatus !== runtimeStatus) {
      publish({
        name: DevtoolEventName.RuntimeStatusChanged,
        time: Date.now(),
        payload: { previous: runtimeStatus, status: nextStatus },
      });
      runtimeStatus = nextStatus;
    }
    syncRecords(Date.now());
  };

  return {
    descriptor: {
      id: 'watch-blive',
      name: '@ciels/watch-blive',
      description: 'Corex-native Bilibili live runtime',
    },
    events: [
      DevtoolEventName.RuntimeStatusChanged,
      DevtoolEventName.OperationStarted,
      DevtoolEventName.OperationCompleted,
      DevtoolEventName.OperationFailed,
      DevtoolEventName.EngramAppended,
      DevtoolEventName.EngramCleared,
      DevtoolEventName.AgentMessageAppended,
      DevtoolEventName.AgentMessagesReset,
    ],
    snapshot() {
      const entries = controller.runtime?.engram.all() ?? [];
      const messages = controller.runtime?.messages ?? [];
      const values = operationValues();
      return {
        runtime: { status: controller.runtime?.status ?? 'idle', observedAt: Date.now() },
        telemetry: summary(values),
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
        const items = filtered.slice(-(input.limit ?? 100));
        return { items, throughSequence: telemetry.throughSequence };
      },
      'engram.query': input => {
        const entries = controller.runtime?.engram.all() ?? [];
        const filtered = entries
          .filter(item => input.after === undefined || item.sequence > input.after)
          .filter(item => input.through === undefined || item.sequence <= input.through)
          .filter(
            item =>
              input.definitionId === undefined || item.value.definition.id === input.definitionId,
          );
        const items = filtered.slice(-(input.limit ?? 100)).map(engramRecord);
        return { items, throughSequence: entries.at(-1)?.sequence ?? 0 };
      },
      'agent.message.query': input => {
        const all = (controller.runtime?.messages ?? []).map(messageRecord);
        const filtered = all
          .filter(item => input.after === undefined || item.sequence > input.after)
          .filter(item => input.role === undefined || item.role === input.role);
        const items = filtered.slice(-(input.limit ?? 100));
        return { items, throughSequence: all.at(-1)?.sequence ?? 0 };
      },
      'runtime.stop': async () => {
        await controller.stop();
        return { status: 'idle', observedAt: Date.now() };
      },
      'engram.clear': () => {
        controller.runtime?.engram.clear();
        engramSequence = -1;
        publish({
          name: DevtoolEventName.EngramCleared,
          time: Date.now(),
          payload: { summary: { size: 0, throughSequence: 0 } },
        });
        return { size: 0, throughSequence: 0 };
      },
      'telemetry.clear': () => {
        telemetry.clear();
        operations.clear();
        return summary([]);
      },
    },
    subscribe(subscriber) {
      if (subscribers.size === 0) {
        stopTelemetry = telemetry.subscribe(onTelemetry);
        controller.on('state', onState);
      }
      subscribers.add(subscriber);
      return () => {
        subscribers.delete(subscriber);
        if (subscribers.size === 0) {
          stopTelemetry?.();
          stopTelemetry = undefined;
          controller.off('state', onState);
        }
      };
    },
  };
}

function updateOperation(
  map: Map<string, OperationRecord>,
  event: TelemetryEvent,
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
    input: event.type === 'operation.started' ? captured(event.input) : omitted(),
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
            output: captured(event.output),
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

function summary(values: readonly OperationRecord[]) {
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
      contents: json(percept.contents),
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
    content: json('content' in message ? message.content : message),
  };
}

function captured(data?: string): SerializedValue {
  if (data === undefined) return omitted();
  try {
    return json(sanitizeDevtoolValue(telemetry.deserialize(data)));
  } catch (error) {
    return {
      type: 'serialization-error',
      error: { name: 'DeserializationError', message: String(error) },
    };
  }
}

function json(value: unknown): SerializedValue {
  try {
    const data = JSON.stringify(sanitizeDevtoolValue(value));
    return data === undefined
      ? omitted()
      : { type: 'serialized', encoding: 'json', data, preview: data.slice(0, 200) };
  } catch (error) {
    return {
      type: 'serialization-error',
      error: { name: 'SerializationError', message: String(error) },
    };
  }
}

export function sanitizeDevtoolValue(
  value: unknown,
  key = '',
  seen = new WeakSet<object>(),
): unknown {
  if (Buffer.isBuffer(value)) return `[Buffer ${value.byteLength} bytes]`;
  if (value instanceof ArrayBuffer) return `[ArrayBuffer ${value.byteLength} bytes]`;
  if (ArrayBuffer.isView(value)) {
    return `[${value.constructor.name} ${value.byteLength} bytes]`;
  }
  if (value instanceof Date) return value.toISOString();
  if (value instanceof URL) return value.toString();
  if (value instanceof Error) {
    return {
      name: value.name,
      message: value.message,
      ...(value.stack ? { stack: value.stack } : {}),
    };
  }
  if (typeof value === 'string') {
    return key === 'data' && value.length > 1_024
      ? `[Binary string ${value.length} characters]`
      : value;
  }
  if (value === null || typeof value !== 'object') return value;
  if (seen.has(value)) return '[Circular]';
  seen.add(value);
  if (Array.isArray(value)) return value.map(item => sanitizeDevtoolValue(item, '', seen));
  return Object.fromEntries(
    Object.entries(value).map(([name, item]) => [name, sanitizeDevtoolValue(item, name, seen)]),
  );
}

function omitted(): SerializedValue {
  return { type: 'omitted', reason: 'capture-disabled' };
}

function pending(): SerializedValue {
  return { type: 'omitted', reason: 'pending' };
}

function isBinary(value: unknown): boolean {
  return Buffer.isBuffer(value) || value instanceof ArrayBuffer || ArrayBuffer.isView(value);
}

function binarySummary(value: unknown): string {
  if (Buffer.isBuffer(value)) return `[Buffer ${value.byteLength} bytes]`;
  if (value instanceof ArrayBuffer) return `[ArrayBuffer ${value.byteLength} bytes]`;
  if (ArrayBuffer.isView(value)) return `[${value.constructor.name} ${value.byteLength} bytes]`;
  return '[Binary]';
}

function isLargeMediaContent(value: unknown): boolean {
  if (!value || typeof value !== 'object') return false;
  const record = value as Record<string, unknown>;
  return (
    (record.type === 'image' || record.type === 'audio') &&
    typeof record.data === 'string' &&
    record.data.length > 1_024
  );
}

function summarizeMediaContent(value: unknown): Readonly<Record<string, unknown>> {
  const record = value as Readonly<Record<string, unknown>>;
  const data = record.data as string;
  return {
    ...record,
    data: `[${record.type === 'image' ? 'Image' : 'Audio'} data ${data.length} characters]`,
  };
}
