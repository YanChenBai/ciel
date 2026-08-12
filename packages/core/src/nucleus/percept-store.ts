import { EventHost } from '@ciels/event';

import type { Percept } from '#src/percepts/index.ts';
import type { Photon, SignalConstructor } from '#src/signals/index.ts';
import type { Stimulus, StimulusConstructor } from '#src/stimulus/index.ts';

import { DEFAULT_CONTEXT_MAX_IMAGES, VISION_FRAMES_PER_IMAGE } from './constants.ts';
import type { ContextContent, ContextData, ContextDefinition, ContextTime } from './types.ts';
import type {
  PerceptCheckout,
  VisionBatch,
  VisionCheckpoint,
  VisionLease,
} from './vision-types.ts';

interface ContextEventMap {
  change(): void;
}

interface ContextSource {
  readonly scene: ContextDefinition;
  readonly signals: Map<SignalConstructor, ContextDefinition>;
}

function getPerceptTime(percept: Percept): ContextTime {
  if (percept.type === 'reading') {
    return {
      startAt: percept.timestamp,
      endAt: percept.timestamp,
    };
  }
  return {
    startAt: percept.startAt,
    endAt: percept.endAt,
  };
}

function getPerceptContent(percept: Percept): ContextContent {
  if (percept.type === 'sight') {
    return {
      type: 'image',
      path: percept.path,
    };
  }
  if (percept.type === 'hearing' && percept.speaker) {
    return {
      type: 'text',
      text: percept.content,
      speaker: percept.speaker,
    };
  }
  return {
    type: 'text',
    text: percept.content,
  };
}

interface NucleusRealtimeSnapshot {
  readonly createdAt: Date;
  readonly data: readonly ContextData[];
}

/** Nucleus 内部的实时感知窗口。 */
export class NucleusPerceptStore extends EventHost<ContextEventMap> {
  private readonly sources = new Map<Stimulus, ContextSource>();
  private readonly entries: ContextData[] = [];
  private readonly committedImageAt = new Map<Stimulus, Map<SignalConstructor, number>>();
  private activeVisionLease?: VisionLease;
  private lastIngestedAt?: number;

  constructor(
    private readonly perceptWindow: number,
    private readonly maxImages: number = DEFAULT_CONTEXT_MAX_IMAGES,
  ) {
    super();
  }

  get active(): boolean {
    return this.entries.length > 0;
  }

  get summarizable(): boolean {
    return this.entries.some(entry => entry.content.type === 'text');
  }

  get lastIngestAt(): number | undefined {
    return this.lastIngestedAt;
  }

  register(stimulus: Stimulus): void {
    if (this.sources.has(stimulus)) {
      return;
    }

    const Stimulus = stimulus.constructor as StimulusConstructor;
    Stimulus.assertMeta();
    const signals = new Map<SignalConstructor, ContextDefinition>();
    const scene: ContextDefinition = {
      kind: 'scene',
      name: Stimulus.meta.name,
      description: Stimulus.meta.description,
    };
    for (const Signal of stimulus.signals) {
      Signal.assertMeta();
      const definition: ContextDefinition = {
        kind: 'signal',
        name: Signal.meta.name,
        description: Signal.meta.description,
      };
      signals.set(Signal, definition);
    }
    this.sources.set(stimulus, { scene, signals });
    this.emit('change');
  }

  ingest(stimulus: Stimulus, percept: Percept): ContextData {
    const signal = percept.originSignal;
    const source = this.sources.get(stimulus);
    if (!source) {
      throw new Error('Stimulus is not registered in this Nucleus context');
    }
    const definition = source.signals.get(signal);
    if (!definition) {
      throw new Error(`${signal.name} is not registered in this Nucleus context`);
    }

    const data: ContextData = {
      stimulus,
      scene: source.scene,
      signal: definition,
      time: getPerceptTime(percept),
      content: getPerceptContent(percept),
      percept,
    };
    if (data.content.type === 'image') {
      if (this.maxImages === 0 || data.time.endAt.getTime() <= this.getCommittedAt(data)) {
        return data;
      }
    }
    this.entries.push(data);
    this.lastIngestedAt = Date.now();
    this.emit('change');
    return data;
  }

  snapshot(createdAt: Date = new Date()): NucleusRealtimeSnapshot {
    const cutoff = createdAt.getTime() - this.perceptWindow;
    const retained = this.entries.filter(
      entry => entry.content.type === 'image' || entry.time.endAt.getTime() >= cutoff,
    );
    this.entries.length = 0;
    this.entries.push(...retained);
    if (retained.length === 0) {
      this.lastIngestedAt = undefined;
    }
    const sorted = retained.toSorted(
      (left, right) =>
        left.time.startAt.getTime() - right.time.startAt.getTime() ||
        left.time.endAt.getTime() - right.time.endAt.getTime(),
    );
    const texts = sorted.filter(entry => entry.content.type === 'text');
    let images: ContextData[] = [];
    if (this.maxImages > 0) {
      images = sorted.filter(entry => entry.content.type === 'image').slice(-this.maxImages);
    }
    const visible = new Set([...texts, ...images]);
    return {
      createdAt,
      data: sorted.filter(entry => visible.has(entry)),
    };
  }

  checkout(createdAt: Date = new Date()): PerceptCheckout {
    const snapshot = this.snapshot(createdAt);
    this.activeVisionLease ??= this.createVisionLease();
    return {
      createdAt,
      data: snapshot.data.filter(entry => entry.content.type === 'text'),
      ...(this.activeVisionLease ? { vision: this.activeVisionLease } : {}),
    };
  }

  commitVision(lease: VisionLease): void {
    if (this.activeVisionLease !== lease) {
      throw new Error('Vision lease is no longer active');
    }
    for (const checkpoint of lease.checkpoints) {
      let signals = this.committedImageAt.get(checkpoint.stimulus);
      if (!signals) {
        signals = new Map();
        this.committedImageAt.set(checkpoint.stimulus, signals);
      }
      signals.set(checkpoint.signal, checkpoint.timestamp);
    }
    this.activeVisionLease = undefined;
    const stale = this.entries.filter(
      entry =>
        entry.content.type === 'image' && entry.time.endAt.getTime() <= this.getCommittedAt(entry),
    );
    this.remove([...lease.data, ...stale]);
  }

  /** 仅移除已经成功归档的那批数据，不影响归档期间新到的感知。 */
  remove(data: readonly ContextData[]): void {
    const removed = new Set(data);
    const retained = this.entries.filter(entry => !removed.has(entry));
    this.entries.length = 0;
    this.entries.push(...retained);
    if (retained.length === 0) {
      this.lastIngestedAt = undefined;
    }
  }

  clear(): void {
    this.entries.length = 0;
    this.activeVisionLease = undefined;
    this.committedImageAt.clear();
    this.lastIngestedAt = undefined;
  }

  private createVisionLease(): VisionLease | undefined {
    const sorted = this.entries
      .filter(
        entry =>
          entry.content.type === 'image' && entry.time.endAt.getTime() > this.getCommittedAt(entry),
      )
      .toSorted(
        (left, right) =>
          left.time.startAt.getTime() - right.time.startAt.getTime() ||
          left.time.endAt.getTime() - right.time.endAt.getTime(),
      );
    const sources: Array<{
      data: ContextData[];
      signal: SignalConstructor<Photon>;
      stimulus: Stimulus;
    }> = [];
    for (const entry of sorted) {
      if (entry.percept.type !== 'sight') {
        continue;
      }
      let source = sources.find(
        value => value.stimulus === entry.stimulus && value.signal === entry.percept.originSignal,
      );
      if (!source) {
        source = {
          data: [],
          signal: entry.percept.originSignal,
          stimulus: entry.stimulus,
        };
        sources.push(source);
      }
      source.data.push(entry);
    }

    const batches: VisionBatch[] = sources
      .flatMap(source => {
        const values: VisionBatch[] = [];
        for (let index = 0; index < source.data.length; index += VISION_FRAMES_PER_IMAGE) {
          values.push({
            signal: source.signal,
            stimulus: source.stimulus,
            data: source.data.slice(index, index + VISION_FRAMES_PER_IMAGE),
          });
        }
        return values;
      })
      .toSorted(
        (left, right) =>
          left.data[0]!.time.startAt.getTime() - right.data[0]!.time.startAt.getTime(),
      )
      .slice(0, this.maxImages);
    if (batches.length === 0) {
      return undefined;
    }

    const data = batches
      .flatMap(batch => batch.data)
      .toSorted(
        (left, right) =>
          left.time.startAt.getTime() - right.time.startAt.getTime() ||
          left.time.endAt.getTime() - right.time.endAt.getTime(),
      );
    const checkpoints: VisionCheckpoint[] = [];
    for (const batch of batches) {
      const timestamp = Math.max(...batch.data.map(entry => entry.time.endAt.getTime()));
      const checkpoint = checkpoints.find(
        value => value.stimulus === batch.stimulus && value.signal === batch.signal,
      );
      if (checkpoint) {
        if (timestamp > checkpoint.timestamp) {
          checkpoints.splice(checkpoints.indexOf(checkpoint), 1, {
            ...checkpoint,
            timestamp,
          });
        }
      } else {
        checkpoints.push({
          signal: batch.signal,
          stimulus: batch.stimulus,
          timestamp,
        });
      }
    }
    return { batches, checkpoints, data };
  }

  private getCommittedAt(data: ContextData): number {
    return this.committedImageAt.get(data.stimulus)?.get(data.percept.originSignal) ?? -Infinity;
  }
}
