import { randomUUID } from 'node:crypto';

import { toError } from '@ciels/event';

import type { ContextInput, ModelContext } from '#src/context/index.ts';
import { toVigiliaName } from '#src/vigilia/name.ts';

import type { NucleusAgent } from './agent.ts';
import type {
  NucleusObservedOperationCompleted,
  NucleusObservedOperationFailed,
  NucleusObservedOperationStarted,
  NucleusOperationCategory,
} from './types.ts';

interface NucleusOperationObserverOptions {
  readonly completed: (event: NucleusObservedOperationCompleted) => void;
  readonly failed: (event: NucleusObservedOperationFailed) => void;
  readonly started: (event: NucleusObservedOperationStarted) => void;
}

export type NucleusGenerationResult<TOutput> = Awaited<
  ReturnType<NucleusAgent<TOutput>['generate']>
>;

/**
 * 统一维护 operation 的开始与结算，确保模型异常时不会遗留仍在运行的子步骤。
 */
export class NucleusOperationObserver {
  constructor(private readonly options: NucleusOperationObserverOptions) {}

  async observe<T>(
    parentOperationId: string,
    category: NucleusOperationCategory,
    name: string,
    action: () => Promise<T>,
    detail?: unknown,
  ): Promise<T> {
    const operation = this.start(parentOperationId, category, name, detail);
    try {
      const result = await action();
      this.complete(operation, result);
      return result;
    } catch (error) {
      const normalized = this.fail(operation, error);
      throw normalized;
    }
  }

  generate<TOutput>(
    parentOperationId: string,
    agent: NucleusAgent<TOutput>,
    input: ContextInput,
    modelContext: ModelContext,
  ): Promise<NucleusGenerationResult<TOutput>> {
    // step 与 tool 由 AI SDK 分别回调，需要按各自稳定 ID 保存开始事件并在结束时配对。
    const stepOperations = new Map<number, NucleusObservedOperationStarted>();
    const toolOperations = new Map<string, NucleusObservedOperationStarted>();

    return this.observe(
      parentOperationId,
      'model',
      'generate',
      async () => {
        try {
          return await agent.generate({
            messages: [...modelContext.messages],
            options: { input, context: modelContext },
            onStepStart: step => {
              const name = modelStepName(step.stepNumber);
              const operation = this.start(parentOperationId, 'model', name);
              stepOperations.set(step.stepNumber, operation);
            },
            onStepEnd: step => {
              const operation = stepOperations.get(step.stepNumber);
              if (!operation) return;

              stepOperations.delete(step.stepNumber);
              this.complete(operation, {
                callId: step.callId,
                finishReason: step.finishReason,
                reasoning: step.reasoningText,
                text: step.text,
                usage: step.usage,
              });
            },
            onToolExecutionStart: event => {
              const operation = this.start(
                parentOperationId,
                'tool',
                toVigiliaName(event.toolCall.toolName, 'tool'),
                {
                  input: event.toolCall.input,
                  toolCallId: event.toolCall.toolCallId,
                  toolName: event.toolCall.toolName,
                },
              );
              toolOperations.set(event.toolCall.toolCallId, operation);
            },
            onToolExecutionEnd: event => {
              const operation = toolOperations.get(event.toolCall.toolCallId);
              if (!operation) return;

              toolOperations.delete(event.toolCall.toolCallId);
              if (event.toolOutput.type === 'tool-error') {
                this.fail(operation, event.toolOutput.error);
                return;
              }
              this.complete(operation, {
                output: event.toolOutput,
                toolCallId: event.toolCall.toolCallId,
              });
            },
          });
        } catch (error) {
          this.failPendingOperations(stepOperations.values(), error);
          this.failPendingOperations(toolOperations.values(), error);
          throw error;
        }
      },
      modelContext,
    );
  }

  private start(
    parentOperationId: string,
    category: NucleusOperationCategory,
    name: string,
    detail?: unknown,
  ): NucleusObservedOperationStarted {
    const operation: NucleusObservedOperationStarted = {
      category,
      ...(detail === undefined ? {} : { detail }),
      name,
      operationId: randomUUID(),
      parentOperationId,
      startedAt: Date.now(),
    };
    this.options.started(operation);
    return operation;
  }

  private complete(operation: NucleusObservedOperationStarted, result?: unknown): void {
    this.options.completed({
      ...operation,
      durationMs: Date.now() - operation.startedAt,
      ...(result === undefined ? {} : { result }),
    });
  }

  private fail(operation: NucleusObservedOperationStarted, error: unknown): Error {
    const normalized = toError(error);
    this.options.failed({
      ...operation,
      durationMs: Date.now() - operation.startedAt,
      error: normalized,
    });
    return normalized;
  }

  private failPendingOperations(
    operations: Iterable<NucleusObservedOperationStarted>,
    error: unknown,
  ): void {
    for (const operation of operations) this.fail(operation, error);
  }
}

function modelStepName(stepNumber: number): string {
  if (stepNumber === 0) return 'choose-response-or-tools';
  return 'continue-with-tool-results';
}
