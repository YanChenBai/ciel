import type { Interceptor } from '@ciels/interceptor';
import type { SuperJSONValue } from 'superjson';

export interface Transformer<T = unknown, Serialized = SuperJSONValue> {
  readonly name: string;
  isApplicable(value: unknown): value is T;
  serialize(value: T): Serialized;
  deserialize(value: Serialized): T;
}

export interface TelemetryCaptureOptions {
  /**
   * 默认关闭，避免把完整 prompt、模型上下文或工具参数意外写入遥测。
   */
  readonly input?: boolean;
  /**
   * 默认关闭，避免把模型输出或工具结果意外写入遥测。
   */
  readonly output?: boolean;
}

export interface TelemetryConfiguration {
  readonly capture?: boolean | TelemetryCaptureOptions;
  /**
   * 注册到 telemetry 单例的 SuperJSON 自定义转换器。
   */
  readonly transformers?: readonly Transformer[];
}

export interface TelemetryOperation {
  readonly id: string;
  readonly name: string;
  readonly parentOperationId?: string;
  readonly metadata?: Readonly<Record<string, unknown>>;
}

export interface TelemetryError {
  readonly message: string;
  readonly name: string;
  readonly stack?: string;
}

interface TelemetryEventBase {
  readonly operation: TelemetryOperation;
  readonly sequence: number;
  readonly time: number;
}

export interface TelemetryOperationStartedEvent extends TelemetryEventBase {
  readonly type: 'operation.started';
  readonly input?: string;
}

export interface TelemetryOperationCompletedEvent extends TelemetryEventBase {
  readonly type: 'operation.completed';
  readonly durationMs: number;
  readonly output?: string;
}

export interface TelemetryOperationFailedEvent extends TelemetryEventBase {
  readonly type: 'operation.failed';
  readonly durationMs: number;
  readonly error: TelemetryError;
}

export type TelemetryEvent =
  | TelemetryOperationStartedEvent
  | TelemetryOperationCompletedEvent
  | TelemetryOperationFailedEvent;

export interface TelemetryEventQuery {
  /**
   * 排除该 sequence 自身。
   */
  readonly after?: number;
  readonly limit?: number;
}

export type TelemetrySubscriber = (event: TelemetryEvent) => void;

export interface Telemetry extends Interceptor {
  (configuration: TelemetryConfiguration): void;
  readonly throughSequence: number;
  deserialize<T = unknown>(value: string): T;
  /**
   * 当前异步调用链内正在执行的最内层 operation。
   */
  currentOperation(): TelemetryOperation | undefined;
  events(query?: TelemetryEventQuery): readonly TelemetryEvent[];
  operation(operationId: string): TelemetryOperation | undefined;
  parentOf(operationId: string): TelemetryOperation | undefined;
  subscribe(subscriber: TelemetrySubscriber): () => void;
  clear(): void;
}
