import { AsyncLocalStorage } from 'node:async_hooks';
import { randomUUID } from 'node:crypto';

import {
  type AnyFunction,
  type InstrumentContext,
  type InterceptorWrapper,
} from '@cieljs/instrument';
import { context as otelContext, metrics, SpanStatusCode, trace } from '@opentelemetry/api';
import type { Attributes, Counter, Histogram, Span } from '@opentelemetry/api';
import { CielOperation, type CielOperationMetadata } from 'corex';

import { captureError, captureValue } from './capture.ts';
import { createSerializer } from './serializer.ts';
import type {
  Telemetry,
  TelemetryCaptureOptions,
  TelemetryConfiguration,
  TelemetryEvent,
  TelemetryEventQuery,
  TelemetryOperation,
  TelemetryOperationCompletedEvent,
  TelemetryOperationFailedEvent,
  TelemetryOperationStartedEvent,
  TelemetrySubscriber,
} from './types.ts';

interface ActiveOperation {
  readonly operation: TelemetryOperation;
  readonly span: Span;
  readonly startedAt: number;
  settled: boolean;
}

interface TelemetryMetrics {
  readonly duration: Histogram;
  readonly errors: Counter;
  readonly operations: Counter;
}

type PendingTelemetryEvent =
  | Omit<TelemetryOperationStartedEvent, 'sequence'>
  | Omit<TelemetryOperationCompletedEvent, 'sequence'>
  | Omit<TelemetryOperationFailedEvent, 'sequence'>;

function resolveCapture(
  capture: boolean | TelemetryCaptureOptions | undefined,
): Required<TelemetryCaptureOptions> {
  if (capture === true) return { input: true, output: true };
  if (!capture) return { input: false, output: false };
  return {
    input: capture.input ?? false,
    output: capture.output ?? false,
  };
}

function attributesOf(operation: TelemetryOperation): Attributes {
  const attributes: Attributes = {
    'ciel.operation.id': operation.id,
    'ciel.operation.label': operation.label,
    'ciel.operation.name': operation.name,
    'ciel.operation.tag': operation.tag,
  };
  if (operation.parentOperationId) {
    attributes['ciel.operation.parent_id'] = operation.parentOperationId;
  }

  for (const [key, value] of Object.entries(operation.metadata ?? {})) {
    if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
      attributes[`ciel.metadata.${key}`] = value;
    }
  }
  return attributes;
}

function isPromiseLike(value: unknown): value is PromiseLike<unknown> {
  return (
    (typeof value === 'object' || typeof value === 'function') &&
    value !== null &&
    'then' in value &&
    typeof value.then === 'function'
  );
}

function hasStreamResult(value: unknown): value is { result(): Promise<unknown> } {
  return (
    typeof value === 'object' &&
    value !== null &&
    'result' in value &&
    typeof value.result === 'function'
  );
}

function isFailedAssistantMessage(value: unknown): value is {
  readonly errorMessage?: string;
  readonly stopReason: 'aborted' | 'error';
} {
  if (!value || typeof value !== 'object' || !('stopReason' in value)) return false;
  return value.stopReason === 'error' || value.stopReason === 'aborted';
}

export function createTelemetry(): Telemetry {
  const bufferSize = 1_000;
  let capture = resolveCapture(undefined);
  const serializer = createSerializer();
  const tracer = trace.getTracer('@ciels/devtool');
  const meter = metrics.getMeter('@ciels/devtool');
  const telemetryMetrics: TelemetryMetrics = {
    duration: meter.createHistogram('ciel.operation.duration', {
      description: 'Corex operation duration',
      unit: 'ms',
    }),
    errors: meter.createCounter('ciel.operation.errors', {
      description: 'Failed Corex operations',
    }),
    operations: meter.createCounter('ciel.operation.started', {
      description: 'Started Corex operations',
    }),
  };
  const storage = new AsyncLocalStorage<ActiveOperation>();
  const history: TelemetryEvent[] = [];
  const operations = new Map<string, TelemetryOperation>();
  const subscribers = new Set<TelemetrySubscriber>();
  let sequence = 0;

  function record(event: PendingTelemetryEvent): void {
    const recorded = { ...event, sequence: ++sequence } as TelemetryEvent;
    history.push(recorded);
    if (history.length > bufferSize) history.splice(0, history.length - bufferSize);

    for (const subscriber of subscribers) {
      try {
        subscriber(recorded);
      } catch {
        // 遥测消费者不能改变被观察运行时的结果
      }
    }
  }

  function start(
    instrumentContext: InstrumentContext<CielOperationMetadata>,
    args: readonly unknown[],
  ): ActiveOperation {
    const parent = storage.getStore();
    const {
      label = instrumentContext.name,
      tag = 'OPERATION',
      ...metadata
    } = instrumentContext.metadata ?? {};
    const operation: TelemetryOperation = {
      id: randomUUID(),
      label,
      name: instrumentContext.name,
      tag,
      ...(parent ? { parentOperationId: parent.operation.id } : {}),
      ...(Object.keys(metadata).length > 0 ? { metadata } : {}),
    };
    const startedAt = Date.now();
    const parentContext = parent
      ? trace.setSpan(otelContext.active(), parent.span)
      : otelContext.active();
    const span = tracer.startSpan(
      operation.name,
      { attributes: attributesOf(operation), startTime: startedAt },
      parentContext,
    );
    const active = { operation, span, startedAt, settled: false };

    operations.set(operation.id, operation);
    while (operations.size > bufferSize) {
      const oldest = operations.keys().next().value;
      if (oldest === undefined) break;
      operations.delete(oldest);
    }
    telemetryMetrics.operations.add(1, { 'ciel.operation.name': operation.name });
    record({
      type: 'operation.started',
      operation,
      time: startedAt,
      ...(capture.input ? { input: captureValue(serializer, args) } : {}),
    });
    return active;
  }

  function complete(active: ActiveOperation, output: unknown): void {
    if (active.settled) return;
    active.settled = true;
    const time = Date.now();
    const durationMs = Math.max(0, time - active.startedAt);
    const serialized = capture.output ? captureValue(serializer, output) : undefined;

    telemetryMetrics.duration.record(durationMs, {
      'ciel.operation.name': active.operation.name,
    });
    if (serialized !== undefined) active.span.setAttribute('ciel.operation.output', serialized);
    active.span.setStatus({ code: SpanStatusCode.OK });
    active.span.end(time);
    record({
      type: 'operation.completed',
      durationMs,
      operation: active.operation,
      ...(serialized === undefined ? {} : { output: serialized }),
      time,
    });
  }

  function fail(active: ActiveOperation, error: unknown): void {
    if (active.settled) return;
    active.settled = true;
    const time = Date.now();
    const durationMs = Math.max(0, time - active.startedAt);
    const serialized = captureError(error);

    telemetryMetrics.duration.record(durationMs, {
      'ciel.operation.name': active.operation.name,
    });
    telemetryMetrics.errors.add(1, { 'ciel.operation.name': active.operation.name });
    active.span.recordException(serialized);
    active.span.setStatus({ code: SpanStatusCode.ERROR, message: serialized.message });
    active.span.end(time);
    record({
      type: 'operation.failed',
      durationMs,
      error: serialized,
      operation: active.operation,
      time,
    });
  }

  function trackStream(active: ActiveOperation, value: unknown): boolean {
    if (active.operation.name !== CielOperation.ModelGenerate.name || !hasStreamResult(value)) {
      return false;
    }

    void value.result().then(
      output => {
        if (isFailedAssistantMessage(output)) {
          fail(active, new Error(output.errorMessage ?? `Agent stopped with ${output.stopReason}`));
        } else {
          complete(active, output);
        }
      },
      error => fail(active, error),
    );
    return true;
  }

  function track(active: ActiveOperation, value: unknown): unknown {
    if (isPromiseLike(value)) {
      return Promise.resolve(value).then(
        output => {
          if (!trackStream(active, output)) complete(active, output);
          return output;
        },
        error => {
          fail(active, error);
          throw error;
        },
      );
    }

    if (!trackStream(active, value)) complete(active, value);
    return value;
  }

  function intercept<T extends AnyFunction>(
    _target: T,
    instrumentContext?: InstrumentContext<CielOperationMetadata>,
  ): InterceptorWrapper<T> | undefined {
    if (!instrumentContext) return undefined;

    return next =>
      function (this: ThisParameterType<T>, ...args: Parameters<T>): ReturnType<T> {
        const active = start(instrumentContext, args);
        const activeOtelContext = trace.setSpan(otelContext.active(), active.span);

        try {
          return storage.run(active, () =>
            otelContext.with(activeOtelContext, () => {
              const result = Reflect.apply(next, this, args);
              return track(active, result) as ReturnType<T>;
            }),
          );
        } catch (error) {
          fail(active, error);
          throw error;
        }
      } as T;
  }

  function events(query: TelemetryEventQuery = {}): readonly TelemetryEvent[] {
    const filtered = history.filter(event => event.sequence > (query.after ?? 0));
    return query.limit === undefined ? [...filtered] : filtered.slice(0, query.limit);
  }

  function operation(operationId: string): TelemetryOperation | undefined {
    return operations.get(operationId);
  }

  function getThroughSequence(): number {
    return sequence;
  }

  function clear(): void {
    history.length = 0;
    operations.clear();
  }

  function applyConfiguration(configuration: TelemetryConfiguration): void {
    if (configuration.capture !== undefined) {
      capture = resolveCapture(configuration.capture);
    }
    for (const transformer of configuration.transformers ?? []) {
      serializer.registerCustom(transformer, transformer.name);
    }
  }

  function currentOperation(): TelemetryOperation | undefined {
    return storage.getStore()?.operation;
  }

  function deserialize<T = unknown>(value: string): T {
    return serializer.parse<T>(value);
  }

  function parentOf(operationId: string): TelemetryOperation | undefined {
    const parentOperationId = operation(operationId)?.parentOperationId;
    return parentOperationId ? operation(parentOperationId) : undefined;
  }

  function unsubscribe(subscriber: TelemetrySubscriber): void {
    subscribers.delete(subscriber);
  }

  function subscribe(subscriber: TelemetrySubscriber): () => void {
    subscribers.add(subscriber);
    return unsubscribe.bind(undefined, subscriber);
  }

  const telemetry = applyConfiguration as Telemetry;
  Object.assign(telemetry, {
    clear,
    currentOperation,
    deserialize,
    events,
    intercept,
    operation,
    parentOf,
    subscribe,
  });
  Object.defineProperty(telemetry, 'throughSequence', {
    enumerable: true,
    get: getThroughSequence,
  });

  return telemetry;
}

export const telemetry = createTelemetry();
