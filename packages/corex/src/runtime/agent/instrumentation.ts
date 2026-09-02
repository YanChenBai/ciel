import type { AgentTool, StreamFn } from '@earendil-works/pi-agent-core';

import { cielOperation, CielOperation, type Instrument } from '../instrumentation.ts';
import type { ResolvedTool } from '../plugins.ts';
import type { AgentPrompt } from './types.ts';

interface InstrumentAgentOperationsOptions {
  readonly instrument: Instrument;
  readonly prompt: AgentPrompt;
  readonly stream: StreamFn;
  readonly tools: readonly ResolvedTool[] | undefined;
}

export interface InstrumentedAgentOperations {
  readonly prompt: AgentPrompt;
  readonly stream: StreamFn;
  readonly tools: readonly AgentTool<any>[] | undefined;
}

function instrumentTools(
  tools: readonly ResolvedTool[] | undefined,
): readonly AgentTool<any>[] | undefined {
  return tools?.map(({ tool, instrument }) => ({
    ...tool,
    execute: instrument(
      tool.execute,
      cielOperation(CielOperation.ToolExecute, {
        toolLabel: tool.label,
        toolName: tool.name,
      }),
    ),
  }));
}

/**
 * 为 Agent 自身拥有的 prompt、模型生成和工具执行边界统一插装
 */
export function instrumentAgentOperations(
  options: InstrumentAgentOperationsOptions,
): InstrumentedAgentOperations {
  const { instrument, prompt, stream, tools } = options;

  return {
    prompt: instrument(prompt, cielOperation(CielOperation.AgentPrompt)),
    stream: instrument(stream, cielOperation(CielOperation.ModelGenerate)),
    tools: instrumentTools(tools),
  };
}
