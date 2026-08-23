import { randomUUID } from 'node:crypto';

import type {
  NucleusObservedOperationCompleted,
  NucleusObservedOperationStarted,
  NucleusThinkCompleted,
} from '#src/nucleus/index.ts';
import type { Nucleus } from '#src/nucleus/index.ts';
import type { InMemoryPerceptStore, StoredPerceptContent } from '#src/percepts/index.ts';
import type { Signal } from '#src/signals/index.ts';
import { captureVigiliaValue, serializeError } from '#src/vigilia/index.ts';
import type { Vigilia, VigiliaJsonValue } from '#src/vigilia/index.ts';

import type { CielState } from './types.ts';

interface ActiveAsrOperation {
  readonly mediaStartAt: Date;
  readonly operationId: string;
  readonly startedAt: number;
}

/** 将运行时事实投影到 Vigilia；该旁路不得参与 Ciel 的感知或决策。 */
export class CielObservability {
  private activeAsr?: ActiveAsrOperation;

  constructor(private readonly vigilia: Vigilia) {}

  observePerceptStore(perceptStore: InMemoryPerceptStore): void {
    perceptStore.on('append', record => {
      const content = this.capturePerceptContent(record.content);
      this.vigilia.record('percept.appended', {
        ...optionalProperty('content', content),
        endAt: record.time.endAt.getTime(),
        perceptType: record.percept.type,
        sequence: record.sequence,
        signal: record.signal.name,
        startAt: record.time.startAt.getTime(),
        stimulus: record.stimulusDefinition.name,
      });
    });
  }

  observeNucleus<TOutput>(nucleus: Nucleus<TOutput>): void {
    nucleus.on('visionComposed', event => this.recordVision(event));
    nucleus.on('thinkStarted', event => {
      this.vigilia.record('nucleus.think.started', {
        fromSequence: event.fromSequence,
        ...optionalProperty('name', event.name),
        operationId: event.operationId,
        throughSequence: event.throughSequence,
        trigger: event.trigger,
      });
    });
    nucleus.on('thinkCompleted', event => this.recordThinkCompleted(event));
    nucleus.on('thinkFailed', event => {
      this.vigilia.record('nucleus.think.failed', {
        durationMs: event.durationMs,
        error: serializeError(event.error),
        ...optionalProperty('name', event.name),
        operationId: event.operationId,
        trigger: event.trigger,
      });
    });
    nucleus.on('operationStarted', event => {
      const detail = this.captureOperationDetail(event, 'started');
      this.vigilia.record('operation.started', {
        category: event.category,
        ...optionalProperty('detail', detail),
        name: event.name,
        operationId: event.operationId,
        parentOperationId: event.parentOperationId,
      });
    });
    nucleus.on('operationCompleted', event => {
      const detail = this.captureOperationDetail(event, 'completed');
      this.vigilia.record('operation.completed', {
        category: event.category,
        ...optionalProperty('detail', detail),
        durationMs: event.durationMs,
        name: event.name,
        operationId: event.operationId,
        parentOperationId: event.parentOperationId,
      });
    });
    nucleus.on('operationFailed', event => {
      this.vigilia.record('operation.failed', {
        category: event.category,
        durationMs: event.durationMs,
        error: serializeError(event.error),
        name: event.name,
        operationId: event.operationId,
        parentOperationId: event.parentOperationId,
      });
    });
    nucleus.on('archiveStarted', operation => {
      this.vigilia.record('memory.archive.started', {
        fromSequence: operation.fromSequence,
        operationId: operation.operationId,
        recordCount: operation.recordCount,
        throughSequence: operation.throughSequence,
      });
    });
    nucleus.on('archiveCompleted', (operation, durationMs, result) => {
      this.vigilia.record('memory.archive.completed', {
        durationMs,
        fromSequence: operation.fromSequence,
        operationId: operation.operationId,
        recordCount: operation.recordCount,
        throughSequence: operation.throughSequence,
        ...includedProperty(this.vigilia.capture.memory && Boolean(result), 'summary', () =>
          captureVigiliaValue(result),
        ),
      });
    });
    nucleus.on('archiveFailed', (error, operation, durationMs) => {
      this.vigilia.record('memory.archive.failed', {
        durationMs,
        error: serializeError(error),
        operationId: operation.operationId,
      });
    });
  }

  async processSignal(signal: Signal, process: () => Promise<void>): Promise<void> {
    const name = signalDisplayName(signal);
    const operationName = sensoryOperationName(signal.type);
    const operationId = randomUUID();
    const sensoryOperationId = randomUUID();
    const startedAt = Date.now();
    let parentOperationId: string | undefined;

    if (this.vigilia.signals) {
      parentOperationId = operationId;
      this.vigilia.record('signal.processing.started', { operationId, signal: name });
    }
    this.vigilia.record('operation.started', {
      category: 'sensory',
      name: operationName,
      operationId: sensoryOperationId,
      ...optionalProperty('parentOperationId', parentOperationId),
    });

    try {
      await process();
      const durationMs = Date.now() - startedAt;
      this.vigilia.record('operation.completed', {
        category: 'sensory',
        durationMs,
        name: operationName,
        operationId: sensoryOperationId,
        ...optionalProperty('parentOperationId', parentOperationId),
      });
      if (this.vigilia.signals) {
        this.vigilia.record('signal.processing.completed', {
          durationMs,
          operationId,
          signal: name,
        });
      }
    } catch (error) {
      const durationMs = Date.now() - startedAt;
      this.vigilia.record('operation.failed', {
        category: 'sensory',
        durationMs,
        error: serializeError(error),
        name: operationName,
        operationId: sensoryOperationId,
        ...optionalProperty('parentOperationId', parentOperationId),
      });
      if (this.vigilia.signals) {
        this.vigilia.record('signal.processing.failed', {
          durationMs,
          error: serializeError(error),
          operationId,
          signal: name,
        });
      }
      throw error;
    }
  }

  startAsr(at: Date): void {
    if (this.activeAsr) return;
    this.activeAsr = { mediaStartAt: at, operationId: randomUUID(), startedAt: Date.now() };
    this.vigilia.record('operation.started', {
      category: 'sensory',
      detail: { mediaStartAt: at.toISOString() },
      name: 'asr',
      operationId: this.activeAsr.operationId,
    });
  }

  completeAsr(at: Date): void {
    const operation = this.takeActiveAsr();
    if (!operation) return;
    this.vigilia.record('operation.completed', {
      category: 'sensory',
      detail: {
        audioDurationMs: Math.max(0, at.getTime() - operation.mediaStartAt.getTime()),
        mediaEndAt: at.toISOString(),
      },
      durationMs: Date.now() - operation.startedAt,
      name: 'asr',
      operationId: operation.operationId,
    });
  }

  failAsr(error: Error): void {
    const operation = this.takeActiveAsr();
    if (!operation) return;
    this.vigilia.record('operation.failed', {
      category: 'sensory',
      durationMs: Date.now() - operation.startedAt,
      error: serializeError(error),
      name: 'asr',
      operationId: operation.operationId,
    });
  }

  cancelAsr(): void {
    if (!this.activeAsr) return;
    // 停止中的未完成语音不会再收到 speechend，必须显式结算以免污染下一次启动。
    this.failAsr(new Error('Ciel stopped before ASR completed'));
  }

  recordSensusError(error: Error): void {
    this.failAsr(error);
    this.vigilia.error('sensus', 'process', error);
  }

  stateChanged(from: CielState, to: CielState): void {
    this.vigilia.record('ciel.state.changed', { from, to });
  }

  private recordVision(event: {
    readonly frameCount: number;
    readonly path: string;
    readonly signal: string;
    readonly stimulus: string;
  }): void {
    const relativePath = this.vigilia.assetPath(event.path);
    if (!relativePath) return;
    this.vigilia.record('vision.composed', {
      frameCount: event.frameCount,
      path: relativePath,
      signal: event.signal,
      stimulus: event.stimulus,
    });
  }

  private recordThinkCompleted(event: NucleusThinkCompleted<unknown>): void {
    try {
      const output = this.captureThoughtOutput(event.output);
      this.vigilia.record('nucleus.think.completed', {
        durationMs: event.durationMs,
        ...optionalProperty('inputTokens', event.inputTokens),
        ...optionalProperty('name', event.name),
        operationId: event.operationId,
        ...optionalProperty('output', output),
        ...optionalProperty('outputTokens', event.outputTokens),
        ...includedProperty(
          this.vigilia.capture.reasoning && Boolean(event.reasoning),
          'reasoning',
          () => captureVigiliaValue(event.reasoning),
        ),
        trigger: event.trigger,
      });
    } catch (error) {
      this.vigilia.error('vigilia', 'project-thought', error);
      this.vigilia.record('nucleus.think.completed', {
        durationMs: event.durationMs,
        ...optionalProperty('inputTokens', event.inputTokens),
        ...optionalProperty('name', event.name),
        operationId: event.operationId,
        ...optionalProperty('outputTokens', event.outputTokens),
        trigger: event.trigger,
      });
    }
  }

  private captureThoughtOutput(output: unknown): VigiliaJsonValue | undefined {
    if (this.vigilia.capture.result) return captureVigiliaValue(output);
    return this.vigilia.projectThought?.(output);
  }

  private captureOperationDetail(
    event: NucleusObservedOperationStarted | NucleusObservedOperationCompleted,
    phase: 'completed' | 'started',
  ): VigiliaJsonValue | undefined {
    let value = event.detail;
    if (phase === 'completed') value = (event as NucleusObservedOperationCompleted).result;
    if (value === undefined) return undefined;

    if (event.category === 'context') {
      if (!this.vigilia.capture.context) return undefined;
      return captureVigiliaValue(value);
    }
    if (event.category === 'memory') {
      if (!this.vigilia.capture.memory) return undefined;
      return captureVigiliaValue(value);
    }
    if (event.category === 'tool') {
      let enabled = this.vigilia.capture.toolInput;
      if (phase === 'completed') enabled = this.vigilia.capture.toolOutput;
      if (!enabled) return undefined;
      return captureVigiliaValue(value);
    }
    if (isModelStep(event)) return this.captureModelStep(value);
    if (event.category === 'model' && phase === 'started') {
      if (!this.vigilia.capture.context) return undefined;
      return captureVigiliaValue(value);
    }
    return undefined;
  }

  private captureModelStep(value: unknown): VigiliaJsonValue | undefined {
    if (!this.vigilia.capture.reasoning && !this.vigilia.capture.result) return undefined;
    const captured = captureVigiliaValue(value);
    if (typeof captured !== 'object' || captured === null || Array.isArray(captured)) {
      return captured;
    }
    const detail = captured as Readonly<Record<string, VigiliaJsonValue>>;
    const projected = { ...detail };
    if (!this.vigilia.capture.reasoning) projected.reasoning = '[capture disabled]';
    if (!this.vigilia.capture.result) projected.text = '[capture disabled]';
    return projected;
  }

  private capturePerceptContent(content: StoredPerceptContent): VigiliaJsonValue | undefined {
    if (!this.vigilia.capturePerceptContent) return undefined;
    if (content.type === 'text') return content as unknown as VigiliaJsonValue;
    const relativePath = this.vigilia.assetPath(content.path);
    if (!relativePath) return undefined;
    return { path: relativePath, type: 'image' };
  }

  private takeActiveAsr(): ActiveAsrOperation | undefined {
    const operation = this.activeAsr;
    this.activeAsr = undefined;
    return operation;
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

function isModelStep(event: NucleusObservedOperationStarted): boolean {
  if (event.category !== 'model') return false;
  return event.name === 'choose-response-or-tools' || event.name === 'continue-with-tool-results';
}

/** 统一构造可选字段，避免观测事件中堆叠条件展开，降低阅读噪声。 */
function optionalProperty<Key extends string, Value>(
  key: Key,
  value: Value | undefined,
): Partial<Record<Key, Value>> {
  if (value === undefined) return {};
  return { [key]: value } as Record<Key, Value>;
}

function includedProperty<Key extends string, Value>(
  included: boolean,
  key: Key,
  createValue: () => Value,
): Partial<Record<Key, Value>> {
  if (!included) return {};
  return { [key]: createValue() } as Record<Key, Value>;
}
