import { createNanoEvents } from 'nanoevents';

import { Hearing } from '#perceptions';
import type { Echo } from '#signals';

import { ASR } from './asr.ts';

export class Auris {
  private readonly emitter = createNanoEvents<{
    sight(data: Hearing): void;
  }>();

  private asr: ASR;

  constructor() {
    this.asr = new ASR();
  }

  observe(echo: Echo) {
    this.asr.write(echo);
  }

  on = this.emitter.on.bind(this.emitter);
}
