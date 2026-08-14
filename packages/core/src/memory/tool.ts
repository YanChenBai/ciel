import { jsonSchema, tool } from 'ai';
import type { Tool } from 'ai';

import { definePrompt } from '#utils';

import type {
  CielMemoryStore,
  MemoryRecall,
  RecallMemoryInput,
  UpdateMemoryInput,
} from './types.ts';

const MEMORY_RECALL_DESCRIPTION = definePrompt(`
按语义搜索跨日期的历史经历。
当前上下文不足时使用。
`);

const MEMORY_RECALL_QUERY_DESCRIPTION = definePrompt(`
要查找的事件、人物、偏好或事实
`);

const MEMORY_RECALL_LIMIT_DESCRIPTION = definePrompt(`
最多返回的经历数量
`);

const MEMORY_UPDATE_DESCRIPTION = definePrompt(`
整体更新精炼、去重后的全局记忆。
必须提交完整的新内容。
`);

const MEMORY_UPDATE_CONTENT_DESCRIPTION = definePrompt(`
精炼、去重后的完整全局记忆
`);

export interface MemoryTools {
  readonly memory_recall: Tool<RecallMemoryInput, MemoryRecall[]>;
  readonly memory_update: Tool<UpdateMemoryInput, { updated: true }>;
}

/**
 * 创建供 Agent 搜索历史经历和精炼全局记忆的工具。
 */
export function createMemoryTools(memory: CielMemoryStore): MemoryTools {
  return {
    memory_recall: tool({
      description: MEMORY_RECALL_DESCRIPTION,
      inputSchema: jsonSchema<RecallMemoryInput>({
        type: 'object',
        properties: {
          query: {
            type: 'string',
            description: MEMORY_RECALL_QUERY_DESCRIPTION,
          },
          limit: {
            type: 'integer',
            minimum: 1,
            description: MEMORY_RECALL_LIMIT_DESCRIPTION,
          },
        },
        required: ['query'],
        additionalProperties: false,
      }),
      execute: ({ query, limit }) => memory.recall(query, limit),
    }),
    memory_update: tool({
      description: MEMORY_UPDATE_DESCRIPTION,
      inputSchema: jsonSchema<UpdateMemoryInput>({
        type: 'object',
        properties: {
          content: {
            type: 'string',
            description: MEMORY_UPDATE_CONTENT_DESCRIPTION,
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
