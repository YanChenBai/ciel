import { EventHost } from '@ciels/event';

import type { ContextDefinition, ContextTime } from '#src/context/index.ts';
import type { Percept } from '#src/percepts/index.ts';
import type { SignalConstructor } from '#src/signals/index.ts';
import type { Stimulus, StimulusConstructor } from '#src/stimulus/index.ts';

import type {
  VestigiumCheckout,
  VestigiumContent,
  VestigiumRecord,
  VestigiumSnapshot,
  VestigiumStore,
} from './types.ts';

interface VestigiumEventMap {
  append(record: VestigiumRecord): void;
}

interface VestigiumSource {
  readonly scene: ContextDefinition;
  readonly signals: Map<SignalConstructor, ContextDefinition>;
}

function getPerceptTime(percept: Percept): ContextTime {
  if (percept.type === 'reading') {
    return { startAt: percept.timestamp, endAt: percept.timestamp };
  }
  return { startAt: percept.startAt, endAt: percept.endAt };
}

function getPerceptContent(percept: Percept): VestigiumContent {
  if (percept.type === 'sight') {
    return { type: 'image', path: percept.path };
  }
  if (percept.type === 'hearing' && percept.speaker) {
    return { type: 'text', text: percept.content, speaker: percept.speaker };
  }
  return { type: 'text', text: percept.content };
}

/** 所有 Sensus 结果的追加式记录层，每个消费者拥有独立提交游标。 */
export class Vestigium extends EventHost<VestigiumEventMap> implements VestigiumStore {
  private readonly sources = new Map<Stimulus, VestigiumSource>();
  private readonly records: VestigiumRecord[] = [];
  private readonly cursors = new Map<string, number>();
  private readonly activeCheckouts = new Map<string, VestigiumCheckout>();
  private nextSequence = 1;
  private nextConsumer = 1;
  private lastAppendedAt?: number;

  get active(): boolean {
    return this.records.length > 0;
  }

  get lastAppendAt(): number | undefined {
    return this.lastAppendedAt;
  }

  createConsumer(prefix: string): string {
    const consumerId = `${prefix}:${this.nextConsumer++}`;
    this.cursors.set(consumerId, 0);
    return consumerId;
  }

  register(stimulus: Stimulus): void {
    if (this.sources.has(stimulus)) return;

    const Stimulus = stimulus.constructor as StimulusConstructor;
    Stimulus.assertMeta();
    const signals = new Map<SignalConstructor, ContextDefinition>();
    for (const Signal of stimulus.signals) {
      Signal.assertMeta();
      signals.set(Signal, {
        kind: 'signal',
        name: Signal.meta.name,
        description: Signal.meta.description,
      });
    }
    this.sources.set(stimulus, {
      scene: {
        kind: 'scene',
        name: Stimulus.meta.name,
        description: Stimulus.meta.description,
      },
      signals,
    });
  }

  append(stimulus: Stimulus, percept: Percept): VestigiumRecord {
    const source = this.sources.get(stimulus);
    if (!source) throw new Error('Stimulus is not registered in Vestigium');
    const signal = source.signals.get(percept.originSignal);
    if (!signal) throw new Error(`${percept.originSignal.name} is not registered in Vestigium`);

    const record: VestigiumRecord = {
      sequence: this.nextSequence++,
      stimulus,
      scene: source.scene,
      signal,
      time: getPerceptTime(percept),
      content: getPerceptContent(percept),
      percept,
    };
    this.records.push(record);
    this.lastAppendedAt = Date.now();
    this.emit('append', record);
    return record;
  }

  checkout(consumerId: string, createdAt: Date = new Date()): VestigiumCheckout {
    const active = this.activeCheckouts.get(consumerId);
    if (active) return active;

    const fromSequence = this.cursors.get(consumerId) ?? 0;
    const throughSequence = this.records.at(-1)?.sequence ?? fromSequence;
    const checkout: VestigiumCheckout = {
      consumerId,
      createdAt,
      fromSequence,
      throughSequence,
      records: this.records.filter(
        record => record.sequence > fromSequence && record.sequence <= throughSequence,
      ),
    };
    this.activeCheckouts.set(consumerId, checkout);
    return checkout;
  }

  commit(checkout: VestigiumCheckout): void {
    if (this.activeCheckouts.get(checkout.consumerId) !== checkout) {
      throw new Error(`Vestigium checkout for ${checkout.consumerId} is no longer active`);
    }
    if ((this.cursors.get(checkout.consumerId) ?? 0) !== checkout.fromSequence) {
      throw new Error(`Vestigium cursor for ${checkout.consumerId} has changed`);
    }
    this.cursors.set(checkout.consumerId, checkout.throughSequence);
    this.activeCheckouts.delete(checkout.consumerId);
  }

  snapshot(createdAt: Date = new Date(), duration?: number): VestigiumSnapshot {
    const cutoff = duration === undefined ? -Infinity : createdAt.getTime() - duration;
    return {
      createdAt,
      records: this.records.filter(record => record.time.endAt.getTime() >= cutoff),
    };
  }

  hasUnread(consumerId: string, predicate?: (record: VestigiumRecord) => boolean): boolean {
    const cursor = this.cursors.get(consumerId) ?? 0;
    return this.records.some(
      record => record.sequence > cursor && (predicate === undefined || predicate(record)),
    );
  }

  /** 只回收所有已注册消费者都提交过、且已离开实时窗口的记录。 */
  compact(createdAt: Date, retainDuration: number): number {
    if (this.cursors.size === 0) return 0;
    const committedThrough = Math.min(...this.cursors.values());
    const cutoff = createdAt.getTime() - retainDuration;
    const retained = this.records.filter(
      record => record.sequence > committedThrough || record.time.endAt.getTime() >= cutoff,
    );
    const removed = this.records.length - retained.length;
    this.records.length = 0;
    this.records.push(...retained);
    return removed;
  }
}
