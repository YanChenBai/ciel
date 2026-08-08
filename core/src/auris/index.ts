import { NanoEvents } from '#/events/index.ts';
import { Hearing } from '#perceptions';
import type { Echo } from '#signals';

import { ASR } from './asr.ts';

export interface AurisEventMap {
  sight(data: Hearing): void;
}

export class Auris extends NanoEvents<AurisEventMap> {
  private asr: ASR;

  constructor() {
    super();
    this.asr = new ASR();
  }

  observe(echo: Echo) {
    this.asr.write(echo);
  }
}
