import { ASR, type ASROptions, type ASRResult } from '@ciels/asr';
import type { Instrument } from '@ciels/interceptor';
import type { EmitSignal, Signal, SignalDefinition } from 'corex';

import { SensuOperationName } from '../instrumentation.ts';
import type { EchoDefinition, EchoPayload, SpeechResultPayload } from '../types.ts';

export interface HearingRuntimeOptions {
  readonly asr?: ASROptions;
  readonly emitSignal: EmitSignal;
  readonly instrument: Instrument;
  readonly onError?: (error: Error) => void;
  readonly origin: EchoDefinition;
  readonly speech: SignalDefinition<SpeechResultPayload>;
}

function toError(error: unknown): Error {
  return error instanceof Error ? error : new Error(String(error));
}

export class HearingRuntime {
  private readonly asr: ASR;
  private error?: Error;
  private readonly pending = new Set<Promise<void>>();
  private readonly publishResult: (result: ASRResult) => Promise<SpeechResultPayload>;
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
      name: SensuOperationName.ASRInput,
      metadata,
    });
    this.publishResult = options.instrument(
      async result => {
        const payload = { origin: this.options.origin, result };
        const temporal = {
          kind: 'interval',
          start: result.startAt.getTime(),
          end: result.endAt.getTime(),
        } as const;
        await this.options.emitSignal(this.options.speech.create(payload, temporal));
        return payload;
      },
      {
        name: SensuOperationName.ASROutput,
        metadata,
      },
    );
    this.unsubscribers = [
      this.asr.on('result', result => this.emitResult(result)),
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

  private emitResult(result: ASRResult): void {
    const pending = this.publishResult(result).then(
      () => undefined,
      error => {
        this.captureError(error);
      },
    );
    this.pending.add(pending);
    void pending.finally(() => this.pending.delete(pending));
  }

  private throwCapturedError(): void {
    if (this.error) {
      const error = this.error;
      this.error = undefined;
      throw error;
    }
  }
}
