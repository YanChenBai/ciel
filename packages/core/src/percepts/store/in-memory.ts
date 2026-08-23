import { EventHost } from '@ciels/event';

import type { ContextDefinition, ContextTime } from '#context';
import type { Percept } from '#percepts';
import type { SignalConstructor } from '#signals';
import type { Stimulus, StimulusConstructor } from '#stimulus';
import { VigiliaChannel } from '#vigilia';

import type {
  PerceptCheckout,
  PerceptRecord,
  PerceptSnapshot,
  PerceptStore,
  StoredPerceptContent,
} from './types.ts';

interface PerceptStoreEventMap {
  append(record: PerceptRecord): void;
}

interface PerceptSource {
  readonly stimulusDefinition: ContextDefinition;
  readonly signals: Map<SignalConstructor, ContextDefinition>;
}

function getPerceptTime(percept: Percept): ContextTime {
  if (percept.type === 'reading') {
    return { startAt: percept.timestamp, endAt: percept.timestamp };
  }
  return { startAt: percept.startAt, endAt: percept.endAt };
}

function getPerceptContent(percept: Percept): StoredPerceptContent {
  if (percept.type === 'sight') {
    return { type: 'image', path: percept.path };
  }
  if (percept.type === 'hearing' && percept.speaker) {
    return { type: 'text', text: percept.content, speaker: percept.speaker };
  }
  return { type: 'text', text: percept.content };
}

/** 所有 Sensus 结果的追加式记录层，每个消费者拥有独立提交游标。 */
export class InMemoryPerceptStore extends EventHost<PerceptStoreEventMap> implements PerceptStore {
  readonly observations = new VigiliaChannel();
  private readonly sources = new Map<Stimulus, PerceptSource>();
  private readonly records: PerceptRecord[] = [];
  private readonly cursors = new Map<string, number>();
  private readonly activeCheckouts = new Map<string, PerceptCheckout>();
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
      stimulusDefinition: {
        kind: 'stimulus',
        name: Stimulus.meta.name,
        description: Stimulus.meta.description,
      },
      signals,
    });
  }

  append(stimulus: Stimulus, percept: Percept): PerceptRecord {
    const source = this.sources.get(stimulus);
    if (!source) throw new Error('Stimulus is not registered in PerceptStore');
    const signal = source.signals.get(percept.originSignal);
    if (!signal) throw new Error(`${percept.originSignal.name} is not registered in PerceptStore`);

    const record: PerceptRecord = {
      sequence: this.nextSequence++,
      stimulus,
      stimulusDefinition: source.stimulusDefinition,
      signal,
      time: getPerceptTime(percept),
      content: getPerceptContent(percept),
      percept,
    };
    this.records.push(record);
    this.lastAppendedAt = Date.now();
    this.observations.emit('percept.appended', {
      content: record.content,
      endAt: record.time.endAt.getTime(),
      perceptType: record.percept.type,
      sequence: record.sequence,
      signal: record.signal.name,
      startAt: record.time.startAt.getTime(),
      stimulus: record.stimulusDefinition.name,
    });
    this.emit('append', record);
    return record;
  }

  checkout(consumerId: string, createdAt: Date = new Date()): PerceptCheckout {
    const active = this.activeCheckouts.get(consumerId);
    if (active) return active;

    const fromSequence = this.cursors.get(consumerId) ?? 0;
    const throughSequence = this.records.at(-1)?.sequence ?? fromSequence;
    const checkout: PerceptCheckout = {
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

  commit(checkout: PerceptCheckout): void {
    if (this.activeCheckouts.get(checkout.consumerId) !== checkout) {
      throw new Error(`PerceptStore checkout for ${checkout.consumerId} is no longer active`);
    }
    if ((this.cursors.get(checkout.consumerId) ?? 0) !== checkout.fromSequence) {
      throw new Error(`PerceptStore cursor for ${checkout.consumerId} has changed`);
    }
    this.cursors.set(checkout.consumerId, checkout.throughSequence);
    this.activeCheckouts.delete(checkout.consumerId);
  }

  snapshot(createdAt: Date = new Date(), duration?: number): PerceptSnapshot {
    const cutoff = duration === undefined ? -Infinity : createdAt.getTime() - duration;
    return {
      createdAt,
      records: this.records.filter(record => record.time.endAt.getTime() >= cutoff),
    };
  }

  hasUnread(consumerId: string, predicate?: (record: PerceptRecord) => boolean): boolean {
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
