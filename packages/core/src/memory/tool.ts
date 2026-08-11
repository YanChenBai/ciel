import { jsonSchema, tool } from 'ai';
import type { Tool } from 'ai';

import type { Memory } from './memory.ts';
import type { RecallMemoryInput, UpdateMemoryInput } from './types.ts';

export interface MemoryTools {
  readonly memory_recall: Tool<RecallMemoryInput, Awaited<ReturnType<Memory['recall']>>>;
  readonly memory_update: Tool<UpdateMemoryInput, { updated: true }>;
}

/**
 * 创建供 Agent 搜索历史经历和精炼全局记忆的工具。
 */
export function createMemoryTools(memory: Memory): MemoryTools {
  return {
    memory_recall: tool({
      description: '按语义搜索跨日期的历史经历。当前上下文不足时使用。',
      inputSchema: jsonSchema<RecallMemoryInput>({
        type: 'object',
        properties: {
          query: {
            type: 'string',
            description: '要查找的事件、人物、偏好或事实',
          },
          limit: {
            type: 'integer',
            minimum: 1,
            description: '最多返回的经历数量',
          },
        },
        required: ['query'],
        additionalProperties: false,
      }),
      execute: ({ query, limit }) => memory.recall(query, limit),
    }),
    memory_update: tool({
      description: '整体更新精炼、去重后的全局记忆。必须提交完整的新内容。',
      inputSchema: jsonSchema<UpdateMemoryInput>({
        type: 'object',
        properties: {
          content: {
            type: 'string',
            description: '精炼、去重后的完整全局记忆',
          },
        },
        required: ['content'],
        additionalProperties: false,
      }),
      execute: async ({ content }) => {
        await memory.updateLongTerm(content);
        return { updated: true };
      },
    }),
  };
}
