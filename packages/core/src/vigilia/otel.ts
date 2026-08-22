import { context, metrics, SpanStatusCode, trace } from '@opentelemetry/api';
import type { Counter, Histogram, Meter, Span, Tracer } from '@opentelemetry/api';

import type { AnyVigiliaEvent } from './types.ts';
import type { Vigilia } from './vigilia.ts';

const INSTRUMENTATION_NAME = '@ciels/core/vigilia';

export interface VigiliaOpenTelemetryOptions {
  readonly meter?: Meter;
  readonly tracer?: Tracer;
}

/** 将 Vigilia 事实投影到 OpenTelemetry，不主动安装 SDK 或 exporter。 */
export class VigiliaOpenTelemetry {
  private readonly duration: Histogram;
  private readonly errors: Counter;
  private readonly events: Counter;
  private readonly spans = new Map<string, Span>();
  private readonly tracer: Tracer;

  constructor(options: VigiliaOpenTelemetryOptions = {}) {
    const meter = options.meter ?? metrics.getMeter(INSTRUMENTATION_NAME);
    this.tracer = options.tracer ?? trace.getTracer(INSTRUMENTATION_NAME);
    this.events = meter.createCounter('ciel.vigilia.events', {
      description: 'Committed Vigilia events',
    });
    this.errors = meter.createCounter('ciel.vigilia.errors', {
      description: 'Observed Ciel runtime errors',
    });
    this.duration = meter.createHistogram('ciel.vigilia.operation.duration', {
      description: 'Ciel operation duration',
      unit: 'ms',
    });
  }

  attach(vigilia: Vigilia): () => void {
    // OTel 只是下游投影；解除绑定不会改变 Vigilia 历史。
    return vigilia.subscribe(event => this.consume(event));
  }

  consume(event: AnyVigiliaEvent): void {
    this.events.add(1, { 'vigilia.event.type': event.type });
    switch (event.type) {
      case 'signal.processing.started':
        this.start(event.data.operationId, 'ciel.signal.process', event.time, {
          'ciel.signal.name': event.data.signal,
        });
        break;
      case 'nucleus.think.started':
        this.start(event.data.operationId, 'ciel.nucleus.think', event.time, {
          'ciel.think.trigger': event.data.trigger,
          'ciel.percept.from_sequence': event.data.fromSequence,
          'ciel.percept.through_sequence': event.data.throughSequence,
        });
        break;
      case 'memory.archive.started':
        this.start(event.data.operationId, 'ciel.memory.archive', event.time, {
          'ciel.percept.from_sequence': event.data.fromSequence,
          'ciel.percept.record_count': event.data.recordCount,
          'ciel.percept.through_sequence': event.data.throughSequence,
        });
        break;
      case 'operation.started':
        this.start(
          event.data.operationId,
          `ciel.${event.data.category}.${event.data.name}`,
          event.time,
          {
            'ciel.operation.category': event.data.category,
            'ciel.operation.name': event.data.name,
            ...(event.data.parentOperationId
              ? { 'ciel.operation.parent_id': event.data.parentOperationId }
              : {}),
          },
          event.data.parentOperationId,
        );
        break;
      case 'signal.processing.completed':
        this.complete(event.data.operationId, 'signal', event.data.durationMs, event.time);
        break;
      case 'nucleus.think.completed':
        this.complete(event.data.operationId, 'think', event.data.durationMs, event.time, {
          ...(event.data.inputTokens === undefined
            ? {}
            : { 'gen_ai.usage.input_tokens': event.data.inputTokens }),
          ...(event.data.outputTokens === undefined
            ? {}
            : { 'gen_ai.usage.output_tokens': event.data.outputTokens }),
        });
        break;
      case 'memory.archive.completed':
        this.complete(event.data.operationId, 'archive', event.data.durationMs, event.time);
        break;
      case 'operation.completed':
        this.complete(
          event.data.operationId,
          event.data.category,
          event.data.durationMs,
          event.time,
        );
        break;
      case 'signal.processing.failed':
        this.fail(
          event.data.operationId,
          'signal',
          event.data.durationMs,
          event.time,
          event.data.error,
        );
        break;
      case 'nucleus.think.failed':
        this.fail(
          event.data.operationId,
          'think',
          event.data.durationMs,
          event.time,
          event.data.error,
        );
        break;
      case 'memory.archive.failed':
        this.fail(
          event.data.operationId,
          'archive',
          event.data.durationMs,
          event.time,
          event.data.error,
        );
        break;
      case 'operation.failed':
        this.fail(
          event.data.operationId,
          event.data.category,
          event.data.durationMs,
          event.time,
          event.data.error,
        );
        break;
      case 'error.observed':
        this.errors.add(1, {
          'ciel.error.phase': event.data.phase,
          'ciel.error.source': event.data.source,
        });
        break;
      case 'ciel.state.changed':
      case 'percept.appended':
        break;
    }
  }

  private start(
    operationId: string,
    name: string,
    time: number,
    attributes: Record<string, number | string>,
    parentOperationId?: string,
  ): void {
    const existing = this.spans.get(operationId);
    if (existing) {
      existing.setStatus({ code: SpanStatusCode.ERROR, message: 'duplicate operation id' });
      existing.end(time);
    }
    // 只有同一进程内已被当前适配器观察到的操作，才可能拥有父 Span。
    const parent = parentOperationId ? this.spans.get(parentOperationId) : undefined;
    const parentContext = parent ? trace.setSpan(context.active(), parent) : undefined;
    this.spans.set(
      operationId,
      this.tracer.startSpan(
        name,
        {
          attributes: { ...attributes, 'ciel.operation.id': operationId },
          startTime: time,
        },
        parentContext,
      ),
    );
  }

  private complete(
    operationId: string,
    kind: string,
    durationMs: number,
    time: number,
    attributes: Record<string, number> = {},
  ): void {
    this.duration.record(durationMs, { 'ciel.operation.kind': kind });
    const span = this.spans.get(operationId);
    if (!span) return;
    span.setAttributes({ ...attributes, 'ciel.operation.duration_ms': durationMs });
    span.setStatus({ code: SpanStatusCode.OK });
    span.end(time);
    this.spans.delete(operationId);
  }

  private fail(
    operationId: string,
    kind: string,
    durationMs: number,
    time: number,
    error: { readonly message: string; readonly name: string; readonly stack?: string },
  ): void {
    this.errors.add(1, { 'ciel.error.source': kind });
    this.duration.record(durationMs, { 'ciel.operation.kind': kind });
    const span = this.spans.get(operationId);
    if (!span) return;
    span.recordException(error);
    span.setStatus({ code: SpanStatusCode.ERROR, message: error.message });
    span.end(time);
    this.spans.delete(operationId);
  }
}
