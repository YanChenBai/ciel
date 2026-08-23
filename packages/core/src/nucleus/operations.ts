import type { ContextInput, ModelContext } from '#context';
import { toVigiliaName } from '#vigilia';
import { VigiliaOperations } from '#vigilia';
import type { VigiliaChannel, VigiliaOperation, VigiliaObservationCategory } from '#vigilia';

import type { NucleusAgent } from './agent.ts';

export type NucleusGenerationResult<TOutput> = Awaited<
  ReturnType<NucleusAgent<TOutput>['generate']>
>;

/** 将 AI SDK 的 step/tool 回调转换为 Nucleus 自己的稳定 operation 语义。 */
export class NucleusOperations {
  private readonly operations: VigiliaOperations;

  constructor(channel: VigiliaChannel) {
    this.operations = new VigiliaOperations(channel);
  }

  observe<Result>(
    parentOperationId: string,
    category: VigiliaObservationCategory,
    name: string,
    action: () => Promise<Result>,
    detail?: unknown,
  ): Promise<Result> {
    return this.operations.observe({ category, detail, name, parentOperationId }, action);
  }

  generate<TOutput>(
    parentOperationId: string,
    agent: NucleusAgent<TOutput>,
    input: ContextInput,
    modelContext: ModelContext,
  ): Promise<NucleusGenerationResult<TOutput>> {
    const stepOperations = new Map<number, VigiliaOperation>();
    const toolOperations = new Map<string, VigiliaOperation>();

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
              const operation = this.operations.start({
                category: 'model',
                name: modelStepName(step.stepNumber),
                parentOperationId,
              });
              stepOperations.set(step.stepNumber, operation);
            },
            onStepEnd: step => {
              const operation = stepOperations.get(step.stepNumber);
              if (!operation) return;
              stepOperations.delete(step.stepNumber);
              operation.complete({
                callId: step.callId,
                finishReason: step.finishReason,
                reasoning: step.reasoningText,
                text: step.text,
                usage: step.usage,
              });
            },
            onToolExecutionStart: event => {
              const operation = this.operations.start({
                category: 'tool',
                detail: {
                  input: event.toolCall.input,
                  toolCallId: event.toolCall.toolCallId,
                  toolName: event.toolCall.toolName,
                },
                name: toVigiliaName(event.toolCall.toolName, 'tool'),
                parentOperationId,
              });
              toolOperations.set(event.toolCall.toolCallId, operation);
            },
            onToolExecutionEnd: event => {
              const operation = toolOperations.get(event.toolCall.toolCallId);
              if (!operation) return;
              toolOperations.delete(event.toolCall.toolCallId);
              if (event.toolOutput.type === 'tool-error') {
                operation.fail(event.toolOutput.error);
                return;
              }
              operation.complete({
                output: event.toolOutput,
                toolCallId: event.toolCall.toolCallId,
              });
            },
          });
        } catch (error) {
          failPendingOperations(stepOperations.values(), error);
          failPendingOperations(toolOperations.values(), error);
          throw error;
        }
      },
      modelContext,
    );
  }
}

function failPendingOperations(operations: Iterable<VigiliaOperation>, error: unknown): void {
  for (const operation of operations) operation.fail(error);
}

function modelStepName(stepNumber: number): string {
  if (stepNumber === 0) return 'choose-response-or-tools';
  return 'continue-with-tool-results';
}
