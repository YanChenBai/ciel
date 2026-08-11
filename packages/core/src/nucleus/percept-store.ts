import { EventHost } from '@ciels/event';

import type { Percept } from '#src/percepts/index.ts';
import type { SignalConstructor } from '#src/signals/index.ts';
import type { Stimulus, StimulusConstructor } from '#src/stimulus/index.ts';

import { DEFAULT_CONTEXT_MAX_IMAGES } from './constants.ts';
import type { ContextContent, ContextData, ContextDefinition, ContextTime } from './types.ts';

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
    this.entries.push(data);
    this.lastIngestedAt = Date.now();
    this.emit('change');
    return data;
  }

  snapshot(createdAt: Date = new Date()): NucleusRealtimeSnapshot {
    const cutoff = createdAt.getTime() - this.perceptWindow;
    const retained = this.entries.filter(entry => entry.time.endAt.getTime() >= cutoff);
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

  /** 仅移除已经成功归档的那批数据，不影响归档期间新到的感知。 */
  remove(data: readonly ContextData[]): void {
    const removed = new Set(data);
    const retained = this.entries.filter(entry => !removed.has(entry));
    this.entries.length = 0;
    this.entries.push(...retained);
  }

  clear(): void {
    this.entries.length = 0;
    this.lastIngestedAt = undefined;
  }
}
