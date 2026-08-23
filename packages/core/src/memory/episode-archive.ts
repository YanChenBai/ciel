import { randomUUID } from 'node:crypto';

import { EventHost, toError } from '@ciels/event';
import type { Unsubscribe } from '@ciels/event';

import type { VisionProjector } from '#context/vision.ts';
import type { PerceptRecord, PerceptStore } from '#percepts';
import { VigiliaChannel } from '#vigilia';

import type { CielMemoryStore, EpisodeRecordResult } from './types.ts';

const RETRY_DELAY = 1_000;

export interface EpisodeArchiveOptions {
  readonly idleTimeout: number;
  readonly isBlocked: () => boolean;
  readonly maxImages: number;
  readonly memory: CielMemoryStore;
  readonly perceptStore: PerceptStore;
  readonly retainDuration: number;
  readonly vision: VisionProjector;
}

export interface EpisodeArchiveEventMap {
  error(error: Error, operation: EpisodeArchiveOperation, durationMs: number): void;
  settled(
    operation: EpisodeArchiveOperation,
    durationMs: number,
    succeeded: boolean,
    result?: EpisodeRecordResult,
  ): void;
  start(operation: EpisodeArchiveOperation): void;
}

export interface EpisodeArchiveOperation {
  readonly fromSequence: number;
  readonly operationId: string;
  readonly recordCount: number;
  readonly startedAt: number;
  readonly throughSequence: number;
}

/** 独立调度未归档感知记录，并交由 Memory 生成和持久化 Episode。 */
export class EpisodeArchive extends EventHost<EpisodeArchiveEventMap> {
  readonly observations = new VigiliaChannel();
  private readonly consumerId: string;
  private inFlight?: Promise<EpisodeRecordResult | void>;
  private retryAt?: number;
  private running = false;
  private timer?: ReturnType<typeof setTimeout>;
  private unsubscribe?: Unsubscribe;

  constructor(private readonly options: EpisodeArchiveOptions) {
    super();
    this.consumerId = options.perceptStore.createConsumer('memory');
  }

  get active(): boolean {
    return this.inFlight !== undefined;
  }

  start(): void {
    this.running = true;
    this.unsubscribe = this.options.perceptStore.on('append', () => this.schedule());
    this.schedule();
  }

  async stop(): Promise<void> {
    this.running = false;
    this.clearTimer();
    this.unsubscribe?.();
    this.unsubscribe = undefined;
    await this.inFlight;
    if (this.options.perceptStore.hasUnread(this.consumerId)) {
      await this.archiveObserved();
    }
  }

  request(): void {
    if (
      this.options.isBlocked() ||
      this.inFlight ||
      !this.options.perceptStore.hasUnread(this.consumerId)
    ) {
      return;
    }
    this.clearTimer();
    const checkout = this.options.perceptStore.checkout(this.consumerId);
    const operation = this.createOperation(checkout);
    this.recordStarted(operation);
    this.emit('start', operation);
    const pending = this.archive(checkout, operation.operationId);
    this.inFlight = pending;
    void pending.then(
      result => this.finish(pending, operation, true, result),
      error => {
        const normalized = toError(error);
        const durationMs = Date.now() - operation.startedAt;
        this.recordFailed(operation, normalized, durationMs);
        this.emit('error', normalized, operation, durationMs);
        this.finish(pending, operation, false);
      },
    );
  }

  schedule(): void {
    this.clearTimer();
    if (
      !this.running ||
      this.options.isBlocked() ||
      this.inFlight ||
      !this.options.perceptStore.hasUnread(this.consumerId)
    ) {
      return;
    }
    const lastAppendAt = this.options.perceptStore.lastAppendAt;
    if (lastAppendAt === undefined) return;

    const dueAt = Math.max(lastAppendAt + this.options.idleTimeout, this.retryAt ?? -Infinity);
    this.timer = setTimeout(
      () => {
        this.timer = undefined;
        this.request();
      },
      Math.max(0, dueAt - Date.now()),
    );
  }

  private async archive(
    checkout = this.options.perceptStore.checkout(this.consumerId),
    parentOperationId?: string,
  ): Promise<EpisodeRecordResult | void> {
    if (checkout.records.length === 0) {
      this.options.perceptStore.commit(checkout);
      return;
    }
    const data = await this.project(checkout.records);
    const result = await this.options.memory.recordEpisode(
      data,
      `percept-store:${checkout.consumerId}:${checkout.fromSequence}-${checkout.throughSequence}`,
      { parentOperationId },
    );
    this.options.perceptStore.commit(checkout);
    this.retryAt = undefined;
    this.options.perceptStore.compact(new Date(), this.options.retainDuration);
    return result;
  }

  private async archiveObserved(): Promise<void> {
    const checkout = this.options.perceptStore.checkout(this.consumerId);
    const operation = this.createOperation(checkout);
    this.recordStarted(operation);
    this.emit('start', operation);
    try {
      const result = await this.archive(checkout, operation.operationId);
      const durationMs = Date.now() - operation.startedAt;
      this.emit('settled', operation, durationMs, true, result === undefined ? undefined : result);
      this.recordCompleted(operation, durationMs, result);
    } catch (error) {
      const normalized = toError(error);
      const durationMs = Date.now() - operation.startedAt;
      this.recordFailed(operation, normalized, durationMs);
      this.emit('error', normalized, operation, durationMs);
      this.emit('settled', operation, durationMs, false);
      throw normalized;
    }
  }

  private createOperation(checkout: {
    readonly fromSequence: number;
    readonly records: readonly PerceptRecord[];
    readonly throughSequence: number;
  }): EpisodeArchiveOperation {
    return {
      fromSequence: checkout.fromSequence,
      operationId: randomUUID(),
      recordCount: checkout.records.length,
      startedAt: Date.now(),
      throughSequence: checkout.throughSequence,
    };
  }

  private async project(records: readonly PerceptRecord[]): Promise<readonly PerceptRecord[]> {
    const texts = records.filter(record => record.content.type === 'text');
    const images = (
      await this.options.vision.project(records, Math.max(1, this.options.maxImages))
    ).map(projection => {
      if (projection.record) return projection.record;
      const first = projection.data[0]!;
      return {
        ...first,
        content: {
          type: 'text' as const,
          text: `[视觉证据不可读取；PerceptStore sequence: ${projection.data
            .map(record => record.sequence)
            .join(', ')}]`,
        },
      };
    });
    return [...texts, ...images].toSorted(
      (left, right) =>
        left.time.startAt.getTime() - right.time.startAt.getTime() ||
        left.time.endAt.getTime() - right.time.endAt.getTime(),
    );
  }

  private finish(
    pending: Promise<EpisodeRecordResult | void>,
    operation: EpisodeArchiveOperation,
    succeeded: boolean,
    result?: EpisodeRecordResult | void,
  ): void {
    if (this.inFlight !== pending) return;
    this.inFlight = undefined;
    if (!succeeded) this.retryAt = Date.now() + RETRY_DELAY;
    this.schedule();
    const durationMs = Date.now() - operation.startedAt;
    this.emit('settled', operation, durationMs, succeeded, result ?? undefined);
    if (succeeded) this.recordCompleted(operation, durationMs, result);
  }

  private clearTimer(): void {
    if (this.timer === undefined) return;
    clearTimeout(this.timer);
    this.timer = undefined;
  }

  private recordStarted(operation: EpisodeArchiveOperation): void {
    this.observations.emit('memory.archive.started', {
      fromSequence: operation.fromSequence,
      operationId: operation.operationId,
      recordCount: operation.recordCount,
      throughSequence: operation.throughSequence,
    });
  }

  private recordCompleted(
    operation: EpisodeArchiveOperation,
    durationMs: number,
    result?: EpisodeRecordResult | void,
  ): void {
    this.observations.emit('memory.archive.completed', {
      durationMs,
      fromSequence: operation.fromSequence,
      operationId: operation.operationId,
      recordCount: operation.recordCount,
      throughSequence: operation.throughSequence,
      ...optionalProperty('summary', result),
    });
  }

  private recordFailed(operation: EpisodeArchiveOperation, error: Error, durationMs: number): void {
    this.observations.emit('memory.archive.failed', {
      durationMs,
      error,
      operationId: operation.operationId,
    });
  }
}

function optionalProperty<Key extends string, Value>(
  key: Key,
  value: Value | undefined,
): Partial<Record<Key, Value>> {
  if (value === undefined) return {};
  return { [key]: value } as Record<Key, Value>;
}
