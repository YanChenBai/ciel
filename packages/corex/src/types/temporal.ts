export interface Instant {
  kind: 'instant';
  at: number;
}

export interface Interval {
  kind: 'interval';
  start: number;
  end: number;
}

export type Temporal = Instant | Interval;
