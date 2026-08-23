import { randomUUID } from 'node:crypto';

import { toError } from '@ciels/event';

import type { VigiliaChannel } from './channel.ts';
import type { VigiliaObservationCategory } from './types.ts';

export interface VigiliaOperationInput {
  readonly category: VigiliaObservationCategory;
  readonly detail?: unknown;
  readonly name: string;
  readonly parentOperationId?: string;
}

export interface VigiliaOperationContext {
  readonly parentOperationId?: string;
}

export interface VigiliaOperation {
  readonly operationId: string;
  complete(result?: unknown): void;
  fail(error: unknown): Error;
}

/** 为所有模块统一 operation 的 ID、计时和一次性结算规则。 */
export class VigiliaOperations {
  constructor(private readonly channel: VigiliaChannel) {}

  start(input: VigiliaOperationInput): VigiliaOperation {
    const operationId = randomUUID();
    const startedAt = Date.now();
    let settled = false;
    this.channel.emit('operation.started', { ...input, operationId });

    return {
      operationId,
      complete: result => {
        if (settled) return;
        settled = true;
        this.channel.emit('operation.completed', {
          category: input.category,
          durationMs: Date.now() - startedAt,
          name: input.name,
          operationId,
          ...optionalProperty('parentOperationId', input.parentOperationId),
          ...optionalProperty('result', result),
        });
      },
      fail: error => {
        const normalized = toError(error);
        if (settled) return normalized;
        settled = true;
        this.channel.emit('operation.failed', {
          category: input.category,
          durationMs: Date.now() - startedAt,
          error: normalized,
          name: input.name,
          operationId,
          ...optionalProperty('parentOperationId', input.parentOperationId),
        });
        return normalized;
      },
    };
  }

  async observe<Result>(
    input: VigiliaOperationInput,
    action: () => Promise<Result>,
  ): Promise<Result> {
    const operation = this.start(input);
    try {
      const result = await action();
      operation.complete(result);
      return result;
    } catch (error) {
      throw operation.fail(error);
    }
  }
}

function optionalProperty<Key extends string, Value>(
  key: Key,
  value: Value | undefined,
): Partial<Record<Key, Value>> {
  if (value === undefined) return {};
  return { [key]: value } as Record<Key, Value>;
}
