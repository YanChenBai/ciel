import { WithMeta } from '#src/utils/index.ts';

export interface PhotonFrame {
  data: Buffer;
  timestamp: Date;
}

export interface PhotonMeta {
  title: string;
  description: string;
}

export abstract class Photon {
  static meta: PhotonMeta;

  readonly type = 'photon' as const;
  readonly data: Buffer;
  readonly timestamp: Date;

  constructor(readonly frame: PhotonFrame) {
    this.data = frame.data;
    this.timestamp = frame.timestamp;
  }

  static WithMeta<const TMeta extends PhotonMeta>(meta: TMeta) {
    return WithMeta(Photon, meta);
  }
}
