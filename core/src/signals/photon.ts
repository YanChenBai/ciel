export interface PhotonFrame {
  data: Buffer;
  capturedAt: Date;
}

export class Photon {
  readonly type = 'photon' as const;

  data: Buffer;
  capturedAt: Date;

  constructor(readonly frame: PhotonFrame) {
    this.data = frame.data;
    this.capturedAt = frame.capturedAt;
  }
}
