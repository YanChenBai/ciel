import { ASR, type ASROptions, type ASRResult } from '@ciels/asr';
import type { Instrument } from '@ciels/interceptor';
import type { Signal } from 'corex';

import { SensuOperation } from '../instrumentation.ts';
import type { EchoDefinition, EchoPayload, SpeechSegment } from '../types.ts';

export interface HearingRuntimeOptions {
  readonly asr?: ASROptions;
  readonly instrument: Instrument;
  readonly onSegment: (segment: SpeechSegment) => Promise<unknown>;
  readonly onError?: (error: Error) => void;
  readonly origin: EchoDefinition;
}

function toError(error: unknown): Error {
  return error instanceof Error ? error : new Error(String(error));
}

export class HearingRuntime {
  private readonly asr: ASR;
  private error?: Error;
  private readonly pending = new Set<Promise<void>>();
  private readonly publishSegment: (segment: SpeechSegment) => Promise<unknown>;
  private result?: ASRResult;
  private speechStartAt?: Date;
  private readonly unsubscribers: (() => void)[];
  private readonly write: ASR['write'];

  constructor(private readonly options: HearingRuntimeOptions) {
    this.asr = new ASR(options.asr);
    const metadata = {
      capability: 'hearing',
      signalDefinitionId: options.origin.id,
      signalDefinitionName: options.origin.name,
    };
    this.write = options.instrument(segment => this.asr.write(segment), {
      ...SensuOperation.ASRInput,
      metadata,
    });
    this.publishSegment = options.instrument(options.onSegment, {
      ...SensuOperation.ASROutput,
      metadata,
    });
    this.unsubscribers = [
      this.asr.on('speechstart', at => {
        // One VAD interval may aggregate PCM from many Echo Signals
        this.speechStartAt = at;
        this.result = undefined;
      }),
      this.asr.on('result', result => {
        this.result = result;
      }),
      this.asr.on('speechend', at => this.emitSegment(at)),
      this.asr.on('error', error => this.captureError(error)),
    ];
  }

  process(signal: Signal<EchoPayload>): void {
    this.throwCapturedError();
    const startAt = new Date(
      signal.temporal.kind === 'instant' ? signal.temporal.at : signal.temporal.start,
    );
    this.write({ data: signal.payload.data, startAt });
    this.throwCapturedError();
  }

  async close(): Promise<void> {
    try {
      this.asr.flush();
      await this.asr.close();
      await Promise.all(this.pending);
      this.throwCapturedError();
    } finally {
      for (const unsubscribe of this.unsubscribers.splice(0)) unsubscribe();
    }
  }

  private captureError(error: unknown): void {
    const normalized = toError(error);
    this.error ??= normalized;
    this.options.onError?.(normalized);
  }

  private emitSegment(endAt: Date): void {
    // Speech end is meaningful even when recognition produced no text
    const result = this.result;
    const segment: SpeechSegment = {
      origin: this.options.origin,
      startAt: this.speechStartAt ?? result?.startAt ?? endAt,
      endAt,
      ...(result ? { result } : {}),
    };
    this.result = undefined;
    this.speechStartAt = undefined;
    const pending = this.publishSegment(segment).then(
      () => undefined,
      error => {
        this.captureError(error);
      },
    );
    this.pending.add(pending);
    void pending.then(() => this.pending.delete(pending));
  }

  private throwCapturedError(): void {
    if (this.error) {
      const error = this.error;
      this.error = undefined;
      throw error;
    }
  }
}
