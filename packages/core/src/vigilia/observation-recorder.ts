import { captureVigiliaValue } from './capture.ts';
import type { VigiliaObservation } from './observability/types.ts';
import { serializeError } from './serialize.ts';
import type { VigiliaEventDataMap, VigiliaEventType, VigiliaJsonValue } from './types.ts';
import type { VigiliaCapturePolicy } from './vigilia.ts';

interface VigiliaObservationRecorderOptions {
  readonly assetPath: (filePath: string) => string | undefined;
  readonly capture: VigiliaCapturePolicy;
  readonly capturePerceptContent: boolean;
  readonly projectThought?: (output: unknown) => VigiliaJsonValue | undefined;
  readonly record: <Type extends VigiliaEventType>(
    type: Type,
    data: VigiliaEventDataMap[Type],
  ) => void;
  readonly signals: boolean;
}

/** 在运行时原始事实进入 Journal 前统一执行捕获策略和安全序列化。 */
export class VigiliaObservationRecorder {
  constructor(private readonly options: VigiliaObservationRecorderOptions) {}

  observe(observation: VigiliaObservation): void {
    switch (observation.type) {
      case 'ciel.state.changed':
        this.options.record(observation.type, observation.data);
        return;
      case 'error.observed':
        this.options.record(observation.type, {
          ...observation.data,
          error: serializeError(observation.data.error),
        });
        return;
      case 'memory.archive.completed':
        this.options.record(observation.type, {
          durationMs: observation.data.durationMs,
          fromSequence: observation.data.fromSequence,
          operationId: observation.data.operationId,
          recordCount: observation.data.recordCount,
          throughSequence: observation.data.throughSequence,
          ...includedProperty(
            this.options.capture.memory && observation.data.summary !== undefined,
            'summary',
            () => captureVigiliaValue(observation.data.summary),
          ),
        });
        return;
      case 'memory.archive.failed':
        this.options.record(observation.type, {
          ...observation.data,
          error: serializeError(observation.data.error),
        });
        return;
      case 'memory.archive.started':
        this.options.record(observation.type, observation.data);
        return;
      case 'nucleus.think.failed':
        this.options.record(observation.type, {
          ...observation.data,
          error: serializeError(observation.data.error),
        });
        return;
      case 'nucleus.think.started':
        this.options.record(observation.type, observation.data);
        return;
      case 'nucleus.think.completed':
        this.recordThinkCompleted(observation.data);
        return;
      case 'operation.started': {
        const parentOperationId = this.captureParentOperationId(
          observation.data.category,
          observation.data.parentOperationId,
        );
        this.options.record(observation.type, {
          category: observation.data.category,
          name: observation.data.name,
          operationId: observation.data.operationId,
          ...optionalProperty('parentOperationId', parentOperationId),
          ...optionalProperty(
            'detail',
            this.captureOperationValue(
              observation.data.category,
              observation.data.name,
              observation.data.detail,
              'started',
            ),
          ),
        });
        return;
      }
      case 'operation.completed': {
        const parentOperationId = this.captureParentOperationId(
          observation.data.category,
          observation.data.parentOperationId,
        );
        this.options.record(observation.type, {
          category: observation.data.category,
          durationMs: observation.data.durationMs,
          name: observation.data.name,
          operationId: observation.data.operationId,
          ...optionalProperty('parentOperationId', parentOperationId),
          ...optionalProperty(
            'detail',
            this.captureOperationValue(
              observation.data.category,
              observation.data.name,
              observation.data.result,
              'completed',
            ),
          ),
        });
        return;
      }
      case 'operation.failed': {
        const parentOperationId = this.captureParentOperationId(
          observation.data.category,
          observation.data.parentOperationId,
        );
        this.options.record(observation.type, {
          category: observation.data.category,
          durationMs: observation.data.durationMs,
          error: serializeError(observation.data.error),
          name: observation.data.name,
          operationId: observation.data.operationId,
          ...optionalProperty('parentOperationId', parentOperationId),
        });
        return;
      }
      case 'percept.appended':
        this.options.record(observation.type, {
          endAt: observation.data.endAt,
          perceptType: observation.data.perceptType,
          sequence: observation.data.sequence,
          signal: observation.data.signal,
          startAt: observation.data.startAt,
          stimulus: observation.data.stimulus,
          ...optionalProperty('content', this.capturePerceptContent(observation.data.content)),
        });
        return;
      case 'signal.processing.completed':
      case 'signal.processing.started':
        if (!this.options.signals) return;
        this.recordSignalObservation(observation);
        return;
      case 'signal.processing.failed':
        if (!this.options.signals) return;
        this.options.record(observation.type, {
          ...observation.data,
          error: serializeError(observation.data.error),
        });
        return;
      case 'vision.composed': {
        const relativePath = this.options.assetPath(observation.data.path);
        if (!relativePath) return;
        this.options.record(observation.type, { ...observation.data, path: relativePath });
      }
    }
  }

  private recordSignalObservation(
    observation: Extract<
      VigiliaObservation,
      { type: 'signal.processing.completed' | 'signal.processing.started' }
    >,
  ): void {
    if (observation.type === 'signal.processing.started') {
      this.options.record(observation.type, observation.data);
      return;
    }
    this.options.record(observation.type, observation.data);
  }

  private recordThinkCompleted(
    data: Extract<VigiliaObservation, { type: 'nucleus.think.completed' }>['data'],
  ): void {
    let projected: VigiliaEventDataMap['nucleus.think.completed'];
    try {
      const output = this.captureThoughtOutput(data.output);
      projected = {
        durationMs: data.durationMs,
        operationId: data.operationId,
        trigger: data.trigger,
        ...optionalProperty('inputTokens', data.inputTokens),
        ...optionalProperty('name', data.name),
        ...optionalProperty('output', output),
        ...optionalProperty('outputTokens', data.outputTokens),
        ...includedProperty(
          this.options.capture.reasoning && data.reasoning !== undefined,
          'reasoning',
          () => captureVigiliaValue(data.reasoning),
        ),
      };
    } catch (error) {
      this.options.record('error.observed', {
        error: serializeError(error),
        phase: 'project-thought',
        source: 'vigilia',
      });
      this.options.record('nucleus.think.completed', {
        durationMs: data.durationMs,
        operationId: data.operationId,
        trigger: data.trigger,
        ...optionalProperty('inputTokens', data.inputTokens),
        ...optionalProperty('name', data.name),
        ...optionalProperty('outputTokens', data.outputTokens),
      });
      return;
    }
    this.options.record('nucleus.think.completed', projected);
  }

  private captureThoughtOutput(output: unknown): VigiliaJsonValue | undefined {
    if (this.options.capture.result) return captureVigiliaValue(output);
    return this.options.projectThought?.(output);
  }

  private captureParentOperationId(
    category: string,
    parentOperationId: string | undefined,
  ): string | undefined {
    if (category === 'sensory' && !this.options.signals) return undefined;
    return parentOperationId;
  }

  private captureOperationValue(
    category: string,
    name: string,
    value: unknown,
    phase: 'completed' | 'started',
  ): VigiliaJsonValue | undefined {
    if (value === undefined) return undefined;
    if (category === 'context') {
      if (!this.options.capture.context) return undefined;
      return captureVigiliaValue(value);
    }
    if (category === 'memory') {
      if (!this.options.capture.memory) return undefined;
      return captureVigiliaValue(value);
    }
    if (category === 'tool') {
      let enabled = this.options.capture.toolInput;
      if (phase === 'completed') enabled = this.options.capture.toolOutput;
      if (!enabled) return undefined;
      return captureVigiliaValue(value);
    }
    if (category !== 'model') return undefined;
    if (isModelStep(name)) return this.captureModelStep(value);
    if (phase !== 'started' || !this.options.capture.context) return undefined;
    return captureVigiliaValue(value);
  }

  private captureModelStep(value: unknown): VigiliaJsonValue | undefined {
    if (!this.options.capture.reasoning && !this.options.capture.result) return undefined;
    const captured = captureVigiliaValue(value);
    if (typeof captured !== 'object' || captured === null || Array.isArray(captured))
      return captured;
    const projected = { ...(captured as Readonly<Record<string, VigiliaJsonValue>>) };
    if (!this.options.capture.reasoning) projected.reasoning = '[capture disabled]';
    if (!this.options.capture.result) projected.text = '[capture disabled]';
    return projected;
  }

  private capturePerceptContent(content: unknown): VigiliaJsonValue | undefined {
    if (!this.options.capturePerceptContent) return undefined;
    if (!content || typeof content !== 'object' || !('type' in content)) return undefined;
    if (content.type === 'text') return captureVigiliaValue(content);
    if (content.type !== 'image' || !('path' in content) || typeof content.path !== 'string') {
      return undefined;
    }
    const relativePath = this.options.assetPath(content.path);
    if (!relativePath) return undefined;
    return { path: relativePath, type: 'image' };
  }
}

function isModelStep(name: string): boolean {
  return name === 'choose-response-or-tools' || name === 'continue-with-tool-results';
}

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
