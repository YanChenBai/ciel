import { EventHost, toError } from '@ciels/event';
import type { Unsubscribe } from '@ciels/event';

import type { VisionProjector } from '#src/context/vision.ts';
import type { PerceptRecord, PerceptStore } from '#src/percepts/index.ts';

import type { CielMemoryStore } from './types.ts';

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
  error(error: Error): void;
  settled(): void;
  start(): void;
}

/** 独立调度未归档感知记录，并交由 Memory 生成和持久化 Episode。 */
export class EpisodeArchive extends EventHost<EpisodeArchiveEventMap> {
  private readonly consumerId: string;
  private inFlight?: Promise<void>;
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
    await this.archive();
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
    this.emit('start');
    const pending = this.archive();
    this.inFlight = pending;
    void pending.then(
      () => this.finish(pending, true),
      error => {
        this.emit('error', toError(error));
        this.finish(pending, false);
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

  private async archive(): Promise<void> {
    const checkout = this.options.perceptStore.checkout(this.consumerId);
    if (checkout.records.length === 0) {
      this.options.perceptStore.commit(checkout);
      return;
    }
    const data = await this.project(checkout.records);
    await this.options.memory.recordEpisode(
      data,
      `percept-store:${checkout.consumerId}:${checkout.fromSequence}-${checkout.throughSequence}`,
    );
    this.options.perceptStore.commit(checkout);
    this.retryAt = undefined;
    this.options.perceptStore.compact(new Date(), this.options.retainDuration);
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

  private finish(pending: Promise<void>, succeeded: boolean): void {
    if (this.inFlight !== pending) return;
    this.inFlight = undefined;
    if (!succeeded) this.retryAt = Date.now() + RETRY_DELAY;
    this.schedule();
    this.emit('settled');
  }

  private clearTimer(): void {
    if (this.timer === undefined) return;
    clearTimeout(this.timer);
    this.timer = undefined;
  }
}
