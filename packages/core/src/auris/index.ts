import { NanoEvents } from '#/events/index.ts';
import { Hearing } from '#perceptions';
import type { Echo } from '#signals';

import { ASR } from './asr.ts';
import type { ASROptions } from './types.ts';

export * from './asr.ts';
export type * from './types.ts';

export interface AurisEventMap {
  hearing(data: Hearing): void;
  error(error: Error): void;
}

export class Auris extends NanoEvents<AurisEventMap> {
  private asr: ASR;

  constructor(options: ASROptions = {}) {
    super();
    this.asr = new ASR(options);
    this.asr.on('result', hearing => this.emit('hearing', hearing));
    this.asr.on('error', error => this.emit('error', error));
  }

  observe(echo: Echo): void {
    this.asr.write(echo);
  }

  flush(): void {
    this.asr.flush();
  }
}
