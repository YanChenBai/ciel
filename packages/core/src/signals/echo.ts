export interface EchoSegment {
  data: Buffer;
  startAt: Date;
  endAt: Date;
}

export abstract class Echo {
  readonly type = 'echo' as const;
  readonly data: Buffer;
  readonly startAt: Date;
  readonly endAt: Date;
  static readonly prompt: string;

  constructor(readonly segment: EchoSegment) {
    this.data = segment.data;
    this.startAt = segment.startAt;
    this.endAt = segment.endAt;
  }
}

export class BliveEcho extends Echo {}
