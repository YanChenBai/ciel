import type { AgentTool } from '@earendil-works/pi-agent-core';
import { Type } from 'typebox';

import type { MemoryActions } from './runtime.ts';
import { serializeMemoryResults } from './serialization.ts';
import type {
  MemoryToolOptions,
  RecallMemoryInput,
  RememberMemoryInput,
  SearchMemoryInput,
  UpdateMemoryInput,
} from './types.ts';

function result<T>(details: T, text = JSON.stringify(details)) {
  return { content: [{ type: 'text' as const, text }], details };
}

/**
 * 创建由同一记忆运行时支持的四个 Agent 工具
 */
export function createMemoryTools(
  memory: MemoryActions,
  options: MemoryToolOptions = {},
): readonly AgentTool<any>[] {
  // 候选写入可能触发每日整合，因此按顺序执行
  const rememberParameters = Type.Object({
    content: Type.String({ minLength: 1, description: '实际发生且值得记住的经历' }),
    scope: Type.Union([Type.Literal('current'), Type.Literal('global')]),
    occurredAt: Type.Optional(Type.Number({ description: '经历发生时间，Unix 毫秒' })),
    idempotencyKey: Type.Optional(Type.String({ minLength: 1 })),
  });

  const remember: AgentTool = {
    name: 'memory_remember',
    label: 'Remember memory',
    description: '提交值得长期保留的经历候选；事实会由独立 Memory Agent 整理后写入。',
    parameters: rememberParameters,
    executionMode: 'sequential',
    async execute(_toolCallId, input) {
      const entry = await memory.remember(input as RememberMemoryInput);
      return result(entry ? { remembered: true, entry } : { remembered: false });
    },
  };

  const updateParameters = Type.Object({
    instruction: Type.String({ minLength: 1, description: '需要纠正或更新的事实说明' }),
    scope: Type.Union([Type.Literal('current'), Type.Literal('global')]),
  });

  const update: AgentTool = {
    name: 'memory_update',
    label: 'Update memory',
    description: '根据更正说明修订全局或当前场景的长期记忆。',
    parameters: updateParameters,
    executionMode: 'sequential',
    async execute(_toolCallId, input) {
      await memory.update(input as UpdateMemoryInput);
      return result({ updated: true });
    },
  };

  const recallParameters = Type.Object({
    query: Type.String({ minLength: 1 }),
    scope: Type.Optional(
      Type.Union([Type.Literal('current'), Type.Literal('global'), Type.Literal('all')]),
    ),
    limit: Type.Optional(Type.Integer({ minimum: 1, maximum: 100 })),
  });

  const recall: AgentTool = {
    name: 'memory_recall',
    label: 'Recall memory',
    description: '召回相关记忆；跨场景检索必须显式使用 all。',
    parameters: recallParameters,
    async execute(_toolCallId, input) {
      const request = input as RecallMemoryInput;
      const entries = await memory.recall({
        ...request,
        scope: request.scope ?? options.defaultRecallRange,
        limit: request.limit ?? options.recallLimit,
      });
      return result(entries, serializeMemoryResults(entries));
    },
  };

  const searchParameters = Type.Object({
    query: Type.Optional(Type.String({ minLength: 1 })),
    scope: Type.Optional(
      Type.Union([Type.Literal('current'), Type.Literal('global'), Type.Literal('all')]),
    ),
    kinds: Type.Optional(
      Type.Array(Type.Union([Type.Literal('daily'), Type.Literal('long-term')]), {
        minItems: 1,
        uniqueItems: true,
      }),
    ),
    from: Type.Optional(Type.String({ pattern: '^\\d{4}-\\d{2}-\\d{2}$' })),
    to: Type.Optional(Type.String({ pattern: '^\\d{4}-\\d{2}-\\d{2}$' })),
    limit: Type.Optional(Type.Integer({ minimum: 1, maximum: 100 })),
    cursor: Type.Optional(Type.String({ minLength: 1 })),
  });

  const search: AgentTool = {
    name: 'memory_search',
    label: 'Search memory',
    description: '确定性搜索已提交的原始记忆，支持作用域、日期、种类和分页过滤。',
    parameters: searchParameters,
    async execute(_toolCallId, input) {
      const request = input as SearchMemoryInput;
      const page = await memory.search({
        ...request,
        limit: request.limit ?? options.searchLimit,
      });
      return result(page);
    },
  };

  return [remember, update, recall, search];
}
