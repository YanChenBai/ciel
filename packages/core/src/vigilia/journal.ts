import { isVigiliaName } from './name.ts';
import { initialVigiliaSnapshot, reduceVigilia } from './projection.ts';
import { snapshotJson } from './serialize.ts';
import type {
  AnyVigiliaEvent,
  VigiliaEvent,
  VigiliaEventDataMap,
  VigiliaEventQuery,
  VigiliaEventType,
  VigiliaSnapshot,
  VigiliaSubscriber,
} from './types.ts';

export interface VigiliaJournalOptions {
  readonly clock?: () => number;
  readonly onSubscriberError?: (error: unknown) => void;
}

/** Vigilia 有序事件及其当前投影在内存中的唯一事实来源。 */
export class VigiliaJournal {
  private readonly clock: () => number;
  private readonly history: AnyVigiliaEvent[] = [];
  private readonly onSubscriberError?: (error: unknown) => void;
  private readonly subscribers = new Set<VigiliaSubscriber>();
  private projection: VigiliaSnapshot = initialVigiliaSnapshot;
  private recording = false;

  constructor(options: VigiliaJournalOptions = {}) {
    this.clock = options.clock ?? Date.now;
    this.onSubscriberError = options.onSubscriberError;
  }

  record<TType extends VigiliaEventType>(
    type: TType,
    data: VigiliaEventDataMap[TType],
  ): VigiliaEvent<TType> {
    // 订阅者可以读取已提交快照，但不能在一次提交过程中再次追加事件。
    if (this.recording) throw new Error('Vigilia does not allow reentrant records');

    this.recording = true;
    try {
      if (type.startsWith('operation.')) {
        const name = (data as { readonly name?: unknown }).name;
        if (typeof name !== 'string' || !isVigiliaName(name)) {
          throw new TypeError('Vigilia operation name must use kebab-case');
        }
      }
      const time = this.clock();
      if (!Number.isFinite(time) || Object.is(time, -0)) {
        throw new TypeError('Vigilia clock must return a finite JSON number');
      }
      const event = Object.freeze({
        data: snapshotJson(data) as unknown as Readonly<VigiliaEventDataMap[TType]>,
        sequence: this.history.length + 1,
        time,
        type,
        version: 1 as const,
      });
      const projection = reduceVigilia(this.projection, event as AnyVigiliaEvent);
      // history 与 projection 必须一同提交，然后才能暴露给订阅者。
      this.history.push(event as AnyVigiliaEvent);
      this.projection = projection;
      for (const subscriber of this.subscribers) {
        try {
          subscriber(event as AnyVigiliaEvent, projection);
        } catch (error) {
          try {
            this.onSubscriberError?.(error);
          } catch {
            // 即使可观测性自身的错误上报失败，也不能破坏被观测的运行时。
          }
        }
      }
      return event;
    } finally {
      this.recording = false;
    }
  }

  events(query: VigiliaEventQuery = {}): readonly AnyVigiliaEvent[] {
    // `after` 是不包含自身的 sequence 游标，重连时可以据此确定性地补齐事件。
    const after = Math.max(0, query.after ?? 0);
    const limit = Math.max(0, query.limit ?? 100);
    return Object.freeze(this.history.filter(event => event.sequence > after).slice(0, limit));
  }

  snapshot(): VigiliaSnapshot {
    return this.projection;
  }

  subscribe(subscriber: VigiliaSubscriber): () => void {
    this.subscribers.add(subscriber);
    return () => this.subscribers.delete(subscriber);
  }
}
