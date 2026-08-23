type InteractionToolName = 'memory_recall' | 'memory_update' | 'send_danmaku';

interface InteractionStep {
  readonly toolCalls: readonly {
    readonly toolName: string;
  }[];
}

interface InteractionStepPreparation {
  readonly activeTools: InteractionToolName[];
  readonly toolChoice:
    | 'auto'
    | 'none'
    | 'required'
    | { readonly toolName: 'send_danmaku'; readonly type: 'tool' };
}

/** 先允许召回，再确保完成互动，最后给稳定事实一次写入记忆的机会。 */
export function prepareInteractionStep(
  steps: readonly InteractionStep[],
): InteractionStepPreparation {
  const calls = steps.flatMap(step => step.toolCalls);
  const interactionResolved = calls.some(call => call.toolName === 'send_danmaku');
  const memoryRecalled = calls.some(call => call.toolName === 'memory_recall');
  const memoryUpdated = calls.some(call => call.toolName === 'memory_update');

  if (interactionResolved && memoryUpdated) {
    return { activeTools: [], toolChoice: 'none' };
  }
  if (interactionResolved) {
    return { activeTools: ['memory_update'], toolChoice: 'auto' };
  }
  if (!memoryRecalled) {
    return {
      activeTools: ['memory_recall', 'send_danmaku'],
      toolChoice: 'required',
    };
  }
  return {
    activeTools: ['send_danmaku'],
    toolChoice: { toolName: 'send_danmaku', type: 'tool' },
  };
}
