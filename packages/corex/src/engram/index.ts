import type { Percept, PerceptDefinition, PerceptOf } from '../percept/index.ts';

export interface CreateEngramOptions {
  /**
   * 默认用于最近查询和游标的时间窗口大小
   */
  readonly windowMs: number;

  /**
   * 条目的保留时长，省略时永久保留
   */
  readonly retentionMs?: number;

  /**
   * 用于记录条目时间戳的时钟
   */
  readonly now?: () => number;
}

export interface EngramEntry<TPercept extends Percept = Percept> {
  /**
   * 条目在当前 Engram 中的递增序号
   */
  readonly sequence: number;

  /**
   * 条目写入 Engram 时的时间戳
   */
  readonly recordedAt: number;

  /**
   * 被记录的 Percept
   */
  readonly value: TPercept;
}

export interface EngramWindow {
  /**
   * 窗口的起始时间
   */
  readonly from: number;

  /**
   * 窗口的结束时间
   */
  readonly to: number;

  /**
   * 落在窗口内的条目
   */
  readonly entries: readonly EngramEntry[];
}

export interface CreateEngramCursorOptions {
  /**
   * 首个窗口的起始时间，默认使用当前时间
   */
  readonly from?: number;

  /**
   * 每个窗口的时长，默认使用 Engram 的窗口大小
   */
  readonly windowMs?: number;
}

export interface EngramCursor {
  /**
   * 当前窗口的起始时间
   */
  readonly position: number;

  /**
   * 读取当前窗口并将游标推进到下一个窗口
   */
  next(): EngramWindow;

  /**
   * 读取当前窗口但不移动游标
   */
  peek(): EngramWindow;

  /**
   * 将游标移动到指定时间
   */
  seek(timestamp: number): void;
}

export interface EngramReader {
  /**
   * 当前保留的条目数量
   */
  readonly size: number;

  /**
   * 获取当前保留的全部条目
   */
  all(): readonly EngramEntry[];

  /**
   * 获取由指定 Percept 定义形成的全部条目
   */
  entries<TDefinition extends PerceptDefinition>(
    percept: TDefinition,
  ): readonly EngramEntry<PerceptOf<TDefinition>>[];

  /**
   * 读取最近一段时间内的条目
   */
  recent(durationMs?: number): readonly EngramEntry[];

  /**
   * 读取指定左闭右开时间范围内的条目
   */
  between(from: number, to: number): readonly EngramEntry[];

  /**
   * 创建按固定时间窗口读取条目的游标
   */
  createCursor(options?: CreateEngramCursorOptions): EngramCursor;
}

export interface EngramView {
  /**
   * 当前快照中的条目数量
   */
  readonly size: number;

  /**
   * 获取当前快照中的全部条目
   */
  all(): readonly EngramEntry[];

  /**
   * 获取当前快照中由指定 Percept 定义形成的条目
   */
  entries<TDefinition extends PerceptDefinition>(
    percept: TDefinition,
  ): readonly EngramEntry<PerceptOf<TDefinition>>[];
}

export interface Engram extends EngramReader {
  /**
   * 将一组 Percept 作为同一时间戳批次写入
   */
  append<TPercept extends Percept>(
    ...percepts: readonly TPercept[]
  ): readonly EngramEntry<TPercept>[];

  /**
   * 清理超过保留时长的条目并返回清理数量
   */
  prune(): number;

  /**
   * 清空全部条目
   */
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
 * 创建用于记录和按时间窗口读取 Percept 的 Engram
 */
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
