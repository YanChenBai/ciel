import type { Attributes } from '@opentelemetry/api';
import type { SuperJSONValue } from 'superjson';

export interface Transformer<T = unknown, Serialized = SuperJSONValue> {
  name: string;

  isApplicable(value: unknown): value is T;

  serialize(value: T): Serialized;

  deserialize(value: Serialized): T;
}

export interface TelemetryOptions {
  /**
   * OpenTelemetry scope
   */
  name: string;

  version?: string;

  transformers?: readonly Transformer[];
}

/**
 * 一次 telemetry operation
 */
export interface TelemetryOperation {
  /**
   * span id
   */
  id: string;

  traceId: string;

  spanId: string;

  /**
   * operation name
   */
  name: string;

  status: 'running' | 'success' | 'error';

  input: unknown;

  result?: unknown;

  error?: unknown;

  startedAt: number;

  endedAt?: number;

  duration?: number;
}

export interface TelemetryContext {
  traceId: string;

  spanId: string;
}

export type TelemetryEvent =
  | {
      type: 'started';

      operation: TelemetryOperation;
    }
  | {
      type: 'completed';

      id: string;

      result: unknown;

      endedAt: number;

      duration: number;
    }
  | {
      type: 'failed';

      id: string;

      error: unknown;

      endedAt: number;

      duration: number;
    };

/**
 * run() 返回 builder
 */
export interface Telemetry {
  name: string;

  run(name: string): TelemetryRun;
}

/**
 * 第一阶段：
 * 还没有 input
 */
export interface TelemetryRun {
  input<TInput>(input: TInput): TelemetryInputRun<TInput>;

  attributes(attributes: Attributes): TelemetryRun;
}

/**
 * 已经绑定 input
 */
export interface TelemetryInputRun<TInput> {
  attributes(attributes: Attributes): TelemetryInputRun<TInput>;

  handle<TResult>(
    handler: (
      input: TInput,

      context: TelemetryContext,
    ) => Promise<TResult>,
  ): TelemetryExecutor<TResult>;
}

/**
 * 延迟执行
 */
export interface TelemetryExecutor<TResult> {
  execute(): Promise<TResult>;
}
