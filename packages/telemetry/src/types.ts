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
