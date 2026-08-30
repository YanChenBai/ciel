import type { PerceptDefinition, PerceptOf } from '#model/percept/index.ts';

import type {
  CreateEngramOptions,
  Engram,
  EngramCheckout,
  EngramEntry,
  EngramView,
  EngramWindow,
} from './types.ts';

export type {
  CreateEngramCursorOptions,
  CreateEngramOptions,
  Engram,
  EngramCheckout,
  EngramConsumer,
  EngramCursor,
  EngramEntry,
  EngramReader,
  EngramRecentOptions,
  EngramView,
  EngramWindow,
} from './types.ts';

function assertPositiveDuration(value: number, name: string): void {
  if (!Number.isFinite(value) || value <= 0) {
    throw new RangeError(`${name} must be a positive finite number`);
  }
}

function assertPositiveInteger(value: number, name: string): void {
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new RangeError(`${name} must be a positive safe integer`);
  }
}

function assertSequence(value: number, name: string): void {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new RangeError(`${name} must be a non-negative safe integer`);
  }
}

function assertSequenceBoundary(value: number, name: string): void {
  if (!Number.isSafeInteger(value) || value < -1) {
    throw new RangeError(`${name} must be a safe integer greater than or equal to -1`);
  }
}

function assertTimestamp(value: number, name: string): void {
  if (!Number.isFinite(value)) {
    throw new RangeError(`${name} must be a finite number`);
  }
}

function selectPerceptEntries<TDefinition extends PerceptDefinition>(
  entries: readonly EngramEntry[],
  percept: TDefinition,
): readonly EngramEntry<PerceptOf<TDefinition>>[] {
  return entries.filter(
    (entry): entry is EngramEntry<PerceptOf<TDefinition>> =>
      entry.value.definition.id === percept.id,
  );
}

/**
 * 从一组固定条目创建只读 Engram 快照
 */
export function createEngramView(source: readonly EngramEntry[]): EngramView {
  const entries = [...source];

  return {
    get size() {
      return entries.length;
    },

    all() {
      return [...entries];
    },

    entries(percept) {
      return selectPerceptEntries(entries, percept);
    },
  };
}

/**
 * 创建用于记录和按序号读取 Percept 的 Engram
 */
export function createEngram(options: CreateEngramOptions): Engram {
  assertPositiveInteger(options.recentLimit, 'recentLimit');
  if (options.retentionMs !== undefined) {
    assertPositiveDuration(options.retentionMs, 'retentionMs');
  }

  const clock = options.now ?? Date.now;
  const entries: EngramEntry[] = [];
  let sequence = 0;
  let consumerSequence = 0;

  const readNow = (): number => {
    const timestamp = clock();
    assertTimestamp(timestamp, 'now() result');
    return timestamp;
  };

  const pruneAt = (timestamp: number): number => {
    if (options.retentionMs === undefined) {
      return 0;
    }

    const cutoff = timestamp - options.retentionMs;
    const retained = entries.filter(entry => entry.recordedAt >= cutoff);
    const removed = entries.length - retained.length;

    if (removed > 0) {
      entries.splice(0, entries.length, ...retained);
    }

    return removed;
  };

  const readBetween = (from: number, to: number): readonly EngramEntry[] => {
    assertTimestamp(from, 'from');
    assertTimestamp(to, 'to');
    if (to < from) {
      throw new RangeError('to must be greater than or equal to from');
    }

    return entries.filter(entry => entry.recordedAt >= from && entry.recordedAt < to);
  };

  return {
    get size() {
      pruneAt(readNow());
      return entries.length;
    },

    all() {
      pruneAt(readNow());
      return [...entries];
    },

    entries(percept) {
      pruneAt(readNow());
      return selectPerceptEntries(entries, percept);
    },

    append(...percepts) {
      if (percepts.length === 0) {
        return [];
      }

      const recordedAt = readNow();
      pruneAt(recordedAt);

      const appended = percepts.map(value => ({
        sequence: sequence++,
        recordedAt,
        value,
      }));

      entries.push(...appended);
      return appended;
    },

    createConsumer(id = `consumer-${consumerSequence++}`) {
      let position = sequence - 1;
      let active: EngramCheckout | undefined;

      return {
        id,

        get position() {
          return position;
        },

        checkout() {
          if (active) {
            return active;
          }

          pruneAt(readNow());
          const through = sequence - 1;
          active = {
            consumerId: id,
            after: position,
            through,
            entries: entries.filter(
              entry => entry.sequence > position && entry.sequence <= through,
            ),
          };
          return active;
        },

        commit(checkout) {
          if (checkout !== active || checkout.consumerId !== id) {
            throw new Error(`Engram checkout does not belong to consumer "${id}"`);
          }

          position = checkout.through;
          active = undefined;
        },
      };
    },

    recent(recentOptions = {}) {
      const limit = recentOptions.limit ?? options.recentLimit;
      const through = recentOptions.through ?? sequence - 1;
      assertPositiveInteger(limit, 'limit');
      assertSequenceBoundary(through, 'through');
      if (through === -1) {
        return [];
      }
      pruneAt(readNow());
      return entries.filter(entry => entry.sequence <= through).slice(-limit);
    },

    betweenSequences(from, through) {
      assertSequence(from, 'from');
      assertSequence(through, 'through');
      if (through < from) {
        throw new RangeError('through must be greater than or equal to from');
      }
      pruneAt(readNow());
      return entries.filter(entry => entry.sequence >= from && entry.sequence <= through);
    },

    between(from, to) {
      pruneAt(readNow());
      return readBetween(from, to);
    },

    createCursor(cursorOptions) {
      const { windowMs } = cursorOptions;
      assertPositiveDuration(windowMs, 'windowMs');

      let position = cursorOptions.from ?? readNow();
      assertTimestamp(position, 'from');

      const readWindow = (): EngramWindow => {
        const to = position + windowMs;
        assertTimestamp(to, 'window end');
        pruneAt(readNow());

        return {
          from: position,
          to,
          entries: readBetween(position, to),
        };
      };

      return {
        get position() {
          return position;
        },

        next() {
          const window = readWindow();
          position = window.to;
          return window;
        },

        peek: readWindow,

        seek(timestamp) {
          assertTimestamp(timestamp, 'timestamp');
          position = timestamp;
        },
      };
    },

    prune() {
      return pruneAt(readNow());
    },

    clear() {
      entries.length = 0;
    },
  };
}
