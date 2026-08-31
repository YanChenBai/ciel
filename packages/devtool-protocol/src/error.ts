import type { JsonValue } from './value.ts';

export const DevtoolProtocolErrorCode = {
  InvalidMessage: 'invalid_message',
  InvalidRequest: 'invalid_request',
  Unsupported: 'unsupported',
  NotFound: 'not_found',
  Conflict: 'conflict',
  CursorExpired: 'cursor_expired',
  Internal: 'internal',
} as const;

export type DevtoolProtocolErrorCode =
  (typeof DevtoolProtocolErrorCode)[keyof typeof DevtoolProtocolErrorCode];

export interface DevtoolProtocolError {
  readonly code: DevtoolProtocolErrorCode;
  readonly message: string;
  readonly retryable: boolean;
  readonly details?: JsonValue;
}
