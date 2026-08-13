import type { Unsubscribe } from '@ciels/event';

import type { ContextDefinition, ContextTime } from '#src/context/index.ts';
import type { Percept } from '#src/percepts/index.ts';
import type { Stimulus } from '#src/stimulus/index.ts';

export interface VestigiumTextContent {
  readonly type: 'text';
  readonly text: string;
  readonly speaker?: string;
}

export interface VestigiumImageContent {
  readonly type: 'image';
  readonly path: string;
}

export type VestigiumContent = VestigiumTextContent | VestigiumImageContent;

/** 一条不可变的感知痕迹。sequence 是进程内单调递增的提交顺序。 */
export interface VestigiumRecord {
  readonly sequence: number;
  readonly stimulus: Stimulus;
  readonly scene: ContextDefinition;
  readonly signal: ContextDefinition;
  readonly time: ContextTime;
  readonly content: VestigiumContent;
  readonly percept: Percept;
}

/** 某个消费者看到的稳定读租约；提交前重复 checkout 会返回同一对象。 */
export interface VestigiumCheckout {
  readonly consumerId: string;
  readonly createdAt: Date;
  readonly fromSequence: number;
  readonly throughSequence: number;
  readonly records: readonly VestigiumRecord[];
}

export interface VestigiumSnapshot {
  readonly createdAt: Date;
  readonly records: readonly VestigiumRecord[];
}

/** Nucleus 与归档器依赖的存储契约，可由内存或持久化实现提供。 */
export interface VestigiumStore {
  readonly active: boolean;
  readonly lastAppendAt: number | undefined;
  createConsumer(prefix: string): string;
  register(stimulus: Stimulus): void;
  append(stimulus: Stimulus, percept: Percept): VestigiumRecord;
  checkout(consumerId: string, createdAt?: Date): VestigiumCheckout;
  commit(checkout: VestigiumCheckout): void;
  snapshot(createdAt?: Date, duration?: number): VestigiumSnapshot;
  hasUnread(consumerId: string, predicate?: (record: VestigiumRecord) => boolean): boolean;
  compact(createdAt: Date, retainDuration: number): number;
  on(event: 'append', listener: (record: VestigiumRecord) => void): Unsubscribe;
}
