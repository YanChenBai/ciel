import { randomUUID } from 'node:crypto';

import type { Signal } from '#signals';
import { VigiliaChannel, VigiliaOperations } from '#vigilia';
import type { VigiliaOperation } from '#vigilia';

interface ActiveAsrOperation {
  readonly mediaStartAt: Date;
  readonly operation: VigiliaOperation;
}

/** Sensus 在信号处理现场产生感官 operation，不由上层根据显示名称反推。 */
export class SensusOperations {
  private readonly operations: VigiliaOperations;
  private activeAsr?: ActiveAsrOperation;

  constructor(private readonly channel: VigiliaChannel) {
    this.operations = new VigiliaOperations(channel);
  }

  async process(signal: Signal, action: () => Promise<void>): Promise<void> {
    const signalOperationId = randomUUID();
    const signalName = signalDisplayName(signal);
    const startedAt = Date.now();
    this.channel.emit('signal.processing.started', {
      operationId: signalOperationId,
      signal: signalName,
    });

    try {
      await this.operations.observe(
        {
          category: 'sensory',
          name: sensoryOperationName(signal.type),
          parentOperationId: signalOperationId,
        },
        action,
      );
      this.channel.emit('signal.processing.completed', {
        durationMs: Date.now() - startedAt,
        operationId: signalOperationId,
        signal: signalName,
      });
    } catch (error) {
      this.channel.emit('signal.processing.failed', {
        durationMs: Date.now() - startedAt,
        error,
        operationId: signalOperationId,
        signal: signalName,
      });
      throw error;
    }
  }

  startAsr(at: Date): void {
    if (this.activeAsr) return;
    this.activeAsr = {
      mediaStartAt: at,
      operation: this.operations.start({
        category: 'sensory',
        detail: { mediaStartAt: at.toISOString() },
        name: 'asr',
      }),
    };
  }

  completeAsr(at: Date): void {
    const active = this.takeActiveAsr();
    if (!active) return;
    active.operation.complete({
      audioDurationMs: Math.max(0, at.getTime() - active.mediaStartAt.getTime()),
      mediaEndAt: at.toISOString(),
    });
  }

  failAsr(error: unknown): void {
    const active = this.takeActiveAsr();
    if (!active) return;
    active.operation.fail(error);
  }

  cancelAsr(): void {
    if (!this.activeAsr) return;
    // close 后不会再有 speechend，必须在 Sensus 内结算自己持有的语音段。
    this.failAsr(new Error('Sensus closed before ASR completed'));
  }

  private takeActiveAsr(): ActiveAsrOperation | undefined {
    const active = this.activeAsr;
    this.activeAsr = undefined;
    return active;
  }
}

function signalDisplayName(signal: Signal): string {
  const Signal = signal.constructor as { readonly meta?: { readonly name?: string } };
  return Signal.meta?.name ?? signal.constructor.name;
}

function sensoryOperationName(type: Signal['type']): string {
  if (type === 'echo') return 'audio-ingest';
  if (type === 'photon') return 'vision';
  return 'text-ingest';
}
