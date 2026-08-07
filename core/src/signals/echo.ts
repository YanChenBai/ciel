export interface EchoSegment {
  data: Buffer;
  startAt: Date;
  endAt: Date;
}

export class Echo {
  readonly type = 'echo' as const;

  data: Buffer;
  startAt: Date;
  endAt: Date;

  constructor(readonly segment: EchoSegment) {
    this.data = segment.data;
    this.startAt = segment.startAt;
    this.endAt = segment.endAt;
  }
}
