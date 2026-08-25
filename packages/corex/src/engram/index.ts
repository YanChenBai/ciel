import type { Percept } from '../percept/index.ts';

export interface CreateEngramOptions {
  /** 默认用于最近查询和游标的时间窗口大小 */
  readonly windowMs: number;

  /** 条目的保留时长，省略时永久保留 */
  readonly retentionMs?: number;

  /** 用于记录条目时间戳的时钟 */
  readonly now?: () => number;
}

export interface EngramEntry {
  readonly sequence: number;

  readonly recordedAt: number;

  readonly value: Percept;
}

export interface EngramWindow {
  readonly from: number;

  readonly to: number;

  readonly entries: readonly EngramEntry[];
}

export interface CreateEngramCursorOptions {
  /** 首个窗口的起始时间，默认使用当前时间 */
  readonly from?: number;

  /** 每个窗口的时长，默认使用 Engram 的窗口大小 */
  readonly windowMs?: number;
}

export interface EngramCursor {
  readonly position: number;

  next(): EngramWindow;

  peek(): EngramWindow;

  seek(timestamp: number): void;
}

export interface Engram {
  readonly size: number;

  append(...percepts: readonly Percept[]): readonly EngramEntry[];

  recent(durationMs?: number): readonly EngramEntry[];

  between(from: number, to: number): readonly EngramEntry[];

  createCursor(options?: CreateEngramCursorOptions): EngramCursor;

  prune(): number;

  clear(): void;
}

function assertPositiveDuration(value: number, name: string): void {
  if (!Number.isFinite(value) || value <= 0) {
    throw new RangeError(`${name} must be a positive finite number`);
  }
}

function assertTimestamp(value: number, name: string): void {
  if (!Number.isFinite(value)) {
    throw new RangeError(`${name} must be a finite number`);
  }
}

export function createEngram(options: CreateEngramOptions): Engram {
  assertPositiveDuration(options.windowMs, 'windowMs');
  if (options.retentionMs !== undefined) {
    assertPositiveDuration(options.retentionMs, 'retentionMs');
  }

  const clock = options.now ?? Date.now;
  const entries: EngramEntry[] = [];
  let sequence = 0;

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

    recent(durationMs = options.windowMs) {
      assertPositiveDuration(durationMs, 'durationMs');
      const to = readNow();
      pruneAt(to);
      return entries.filter(entry => entry.recordedAt >= to - durationMs && entry.recordedAt <= to);
    },

    between(from, to) {
      pruneAt(readNow());
      return readBetween(from, to);
    },

    createCursor(cursorOptions = {}) {
      const windowMs = cursorOptions.windowMs ?? options.windowMs;
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
