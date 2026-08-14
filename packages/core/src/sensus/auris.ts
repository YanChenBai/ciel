import { ASR } from '@ciels/asr';

import { Hearing } from '#percepts';
import type { Echo } from '#signals';

import { SensusBase } from './base.ts';
import type { AurisOptions } from './types.ts';

export type { ASROptions } from '@ciels/asr';
export type { AurisEventMap, AurisOptions } from './types.ts';

/**
 * 接收 Echo 并形成 Hearing 的听觉感官
 */
export class Auris extends SensusBase<Echo, Hearing> {
  private readonly asr: ASR;

  constructor(signal: typeof Echo, options: AurisOptions = {}) {
    super(signal);
    this.asr = new ASR(options);
    this.asr.on('result', result => {
      this.emitData(new Hearing({ ...result, originSignal: this.signal }));
    });
    // ASR 保证先发送 result，再发送 speechend；上层可在完整 Hearing 入库后触发思考。
    this.asr.on('speechend', at => this.emit('speechend', at));
    this.asr.on('error', error => this.emitError(error));
  }

  process(echo: Echo): void {
    try {
      this.assertSignal(echo);
      this.asr.write({ data: echo.data, startAt: echo.startAt });
    } catch (error) {
      this.emitError(error);
    }
  }

  flush(): void {
    this.asr.flush();
  }

  override async close(): Promise<void> {
    try {
      this.flush();
    } finally {
      await super.close();
    }
  }
}
