import { ASR } from '@ciels/asr';
import type { ASROptions } from '@ciels/asr';
import { EventHost } from '@ciels/event';

import { Hearing } from '#perceptions';
import type { Echo } from '#signals';

export type { ASROptions } from '@ciels/asr';

export interface AurisEventMap {
  hearing(data: Hearing): void;
  error(error: Error): void;
}

export interface AurisOptions extends ASROptions {
  signal: typeof Echo;
}

export class Auris extends EventHost<AurisEventMap> {
  private readonly asr: ASR;
  private readonly signal: typeof Echo;

  constructor({ signal, ...options }: AurisOptions) {
    super();
    validateSignal(signal);
    this.signal = signal;
    this.asr = new ASR(options);
    this.asr.on('result', result => {
      this.emit('hearing', new Hearing({ ...result, signal: this.signal }));
    });
    this.asr.on('error', error => this.emit('error', error));
  }

  observe(echo: Echo): void {
    try {
      if (!(echo instanceof this.signal)) {
        throw new Error('Auris can only observe Echo instances from its bound signal');
      }
      this.asr.write({
        data: echo.data,
        startAt: echo.startAt,
      });
    } catch (error) {
      this.emit('error', error instanceof Error ? error : new Error(String(error)));
    }
  }

  flush(): void {
    this.asr.flush();
  }
}

function validateSignal(signal: typeof Echo): void {
  if (!signal.meta?.title || !signal.meta.description) {
    throw new Error('Auris signal must be created from Echo.WithMeta(...)');
  }
}
