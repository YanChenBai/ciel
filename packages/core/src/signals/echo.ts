import { WithMeta } from '#src/utils/with-meta.ts';

export interface EchoSegment {
  data: Buffer;
  startAt: Date;
  endAt: Date;
}

export interface EchoMeta {
  title: string;
  description: string;
}

export abstract class Echo {
  static meta: EchoMeta;

  readonly type = 'echo' as const;
  readonly data: Buffer;
  readonly startAt: Date;
  readonly endAt: Date;

  constructor(readonly segment: EchoSegment) {
    this.data = segment.data;
    this.startAt = segment.startAt;
    this.endAt = segment.endAt;
  }

  static WithMeta<const TMeta extends EchoMeta>(meta: TMeta) {
    return WithMeta(Echo, meta);
  }
}
