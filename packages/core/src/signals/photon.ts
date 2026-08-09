export interface PhotonFrame {
  data: Buffer;
  capturedAt: Date;
}

export abstract class Photon {
  readonly type = 'photon' as const;
  readonly data: Buffer;
  readonly capturedAt: Date;
  static readonly prompt: string;

  constructor(readonly frame: PhotonFrame) {
    this.data = frame.data;
    this.capturedAt = frame.capturedAt;
  }
}
