// @env node

import type { DevtoolTarget, DevtoolTargetEvent } from '@ciels/devtool-bridge';
import type {
  AgentMessageRecord,
  EngramEntryRecord,
  OperationCategory,
  OperationRecord,
  SerializedValue,
} from '@ciels/devtool-protocol';
import { telemetry } from '@ciels/telemetry';
import type { TelemetryEvent } from '@ciels/telemetry';
import type { AgentMessage } from '@earendil-works/pi-agent-core';
import type { EngramEntry } from 'corex';

import type { RuntimeController } from './runtime.ts';

export function createRuntimeTarget(controller: RuntimeController): DevtoolTarget {
  const operations = new Map<string, OperationRecord>();
  const subscribers = new Set<(event: DevtoolTargetEvent) => PromiseLike<void> | void>();
  const unsubscribeTelemetry = telemetry.subscribe(event => {
    const operation = updateOperation(operations, event);
    const name = event.type;
    for (const subscriber of subscribers) {
      void subscriber({ name, time: event.time, payload: { operation } } as DevtoolTargetEvent);
    }
  });

  return {
    descriptor: {
      id: 'watch-blive',
      name: '@ciels/watch-blive',
      description: 'Corex-native Bilibili live runtime',
    },
    events: ['operation.started', 'operation.completed', 'operation.failed'],
    snapshot() {
      const entries = controller.runtime?.engram.all() ?? [];
      const messages = controller.runtime?.messages ?? [];
      const values = [...operations.values()];
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
        const items = [...operations.values()]
          .filter(item => input.after === undefined || item.startedAt > input.after)
          .filter(item => input.name === undefined || item.name === input.name)
          .filter(item => input.parentId === undefined || item.parentId === input.parentId)
          .filter(item => input.status === undefined || item.status === input.status)
          .slice(0, input.limit ?? 100);
        return { items, throughSequence: telemetry.throughSequence };
      },
      'engram.query': input => {
        const entries = controller.runtime?.engram.all() ?? [];
        const items = entries
          .filter(item => input.after === undefined || item.sequence > input.after)
          .filter(item => input.through === undefined || item.sequence <= input.through)
          .filter(
            item =>
              input.definitionId === undefined || item.value.definition.id === input.definitionId,
          )
          .slice(0, input.limit ?? 100)
          .map(engramRecord);
        return { items, throughSequence: entries.at(-1)?.sequence ?? 0 };
      },
      'agent.message.query': input => {
        const all = (controller.runtime?.messages ?? []).map(messageRecord);
        const items = all
          .filter(item => input.after === undefined || item.sequence > input.after)
          .filter(item => input.role === undefined || item.role === input.role)
          .slice(0, input.limit ?? 100);
        return { items, throughSequence: all.at(-1)?.sequence ?? 0 };
      },
      'runtime.stop': async () => {
        await controller.stop();
        return { status: 'idle', observedAt: Date.now() };
      },
      'engram.clear': () => {
        controller.runtime?.engram.clear();
        return { size: 0, throughSequence: 0 };
      },
      'telemetry.clear': () => {
        telemetry.clear();
        operations.clear();
        return summary([]);
      },
    },
    subscribe(subscriber) {
      subscribers.add(subscriber);
      return () => {
        subscribers.delete(subscriber);
        if (subscribers.size === 0) unsubscribeTelemetry();
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
    name: event.operation.name,
    category: category(event.operation.name),
    startedAt: event.time,
    status: 'running' as const,
    attributes: {},
    input: event.type === 'operation.started' ? captured(event.input) : omitted(),
    output: omitted(),
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

function category(name: string): OperationCategory {
  for (const value of ['agent', 'signal', 'sensu', 'projector', 'tool', 'plugin'] as const) {
    if (name.includes(`.${value}.`)) return value;
  }
  return 'custom';
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
  return data === undefined ? omitted() : { type: 'serialized', encoding: 'superjson', data };
}

function json(value: unknown): SerializedValue {
  try {
    const data = JSON.stringify(value, (_key, item) =>
      Buffer.isBuffer(item) ? `[Buffer ${item.byteLength} bytes]` : item,
    );
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

function omitted(): SerializedValue {
  return { type: 'omitted', reason: 'capture-disabled' };
}
