import { jsonSchema, tool } from 'ai';
import type { Tool } from 'ai';

import type {
  CielMemoryStore,
  MemoryScope,
  MemoryRecall,
  RecallMemoryInput,
  UpdateMemoryInput,
} from './types.ts';

export interface MemoryTools {
  readonly memory_recall: Tool<RecallMemoryInput, MemoryRecall[]>;
  readonly memory_update: Tool<UpdateMemoryInput, { updated: true }>;
}

/**
 * 创建供 Agent 搜索历史经历和精炼全局记忆的工具。
 */
export function createMemoryTools(
  memory: CielMemoryStore,
  getCurrentScope: () => MemoryScope | undefined = () => undefined,
): MemoryTools {
  return {
    memory_recall: tool({
      description:
        '按语义搜索带来源的历史经历。默认只搜索当前场景；需要借鉴其他场景经验时使用 all。',
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
          scope: {
            type: 'string',
            enum: ['current', 'global', 'all'],
            description: 'current 搜索当前场景，global 搜索全局经历，all 跨场景搜索',
          },
        },
        required: ['query'],
        additionalProperties: false,
      }),
      execute: ({ query, limit, scope = 'current' }) =>
        memory.recall(query, {
          limit,
          range: scope,
          scope: getCurrentScope(),
        }),
    }),
    memory_update: tool({
      description: '整体更新精炼、去重后的全局或当前场景记忆。必须提交目标作用域的完整新内容。',
      inputSchema: jsonSchema<UpdateMemoryInput>({
        type: 'object',
        properties: {
          content: {
            type: 'string',
            description: '精炼、去重后的目标作用域完整记忆',
          },
          scope: {
            type: 'string',
            enum: ['current', 'global'],
            description: '稳定的跨场景事实写入 global；场景专属事实写入 current',
          },
        },
        required: ['content', 'scope'],
        additionalProperties: false,
      }),
      execute: async ({ content, scope }) => {
        const currentScope = getCurrentScope();
        if (scope === 'current' && !currentScope) {
          throw new Error('当前没有可写入的记忆作用域');
        }
        await memory.updateLongTerm(content, scope === 'current' ? { scope: currentScope } : {});
        return { updated: true };
      },
    }),
  };
}
