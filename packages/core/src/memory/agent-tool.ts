import { jsonSchema, tool } from 'ai';
import type { Tool } from 'ai';

import type { Memory } from './memory.ts';

/**
 * Agent 写入一条长期记忆时提供的结构化参数。
 */
interface RememberMemoryInput {
  /**
   * 简短、稳定的记忆类别名称。
   */
  name: string;

  /**
   * 未来召回时应如何理解这条记忆。
   */
  description: string;

  /**
   * 值得长期保存的具体内容。
   */
  content: string;
}

/**
 * 记忆写入工具的可测试配置。
 */
interface RememberMemoryToolOptions {
  now?: () => Date;
}

/**
 * Mastra 历史召回工具在无向量模式下开放的参数。
 */
interface RecallMemoryInput {
  /**
   * 浏览消息或会话列表。
   */
  mode?: 'messages' | 'threads';

  /**
   * 指定会话，或使用 `current` 表示当前会话。
   */
  threadId?: string;

  /**
   * 作为分页起点的消息 ID。
   */
  cursor?: string;

  /**
   * 未指定游标时从最早或最新一端开始。
   */
  anchor?: 'start' | 'end';

  /**
   * 相对于游标的页偏移。
   */
  page?: number;

  /**
   * 单页最多返回的条目数。
   */
  limit?: number;

  /**
   * 返回精简或完整消息内容。
   */
  detail?: 'low' | 'high';
}

/**
 * 创建让 Agent 主动筛选并写入长期记忆的工具。
 */
function createRememberMemoryTool(
  memory: Memory,
  options: RememberMemoryToolOptions = {},
): Tool<RememberMemoryInput, { remembered: true }> {
  const now = options.now ?? (() => new Date());
  return tool({
    description:
      '保存一条在未来仍有价值的长期记忆。不要保存短暂观察、当前上下文已有内容或重复记忆。',
    inputSchema: jsonSchema<RememberMemoryInput>({
      type: 'object',
      properties: {
        name: {
          type: 'string',
          description: '简短、稳定的记忆类别名称',
        },
        description: {
          type: 'string',
          description: '说明未来召回时应如何理解这条记忆',
        },
        content: {
          type: 'string',
          description: '值得长期保存的事实、事件摘要、偏好或经验',
        },
      },
      required: ['name', 'description', 'content'],
      additionalProperties: false,
    }),
    execute: async input => {
      const timestamp = now();
      await memory.rememberLongTerm({
        name: input.name,
        description: input.description,
        time: { startAt: timestamp, endAt: timestamp },
        content: { type: 'text', text: input.content },
      });
      return { remembered: true };
    },
  });
}

/**
 * 将 Mastra 原生历史召回能力暴露给 Vercel AI SDK Agent。
 * 当前没有配置 embedding，因此主动排除语义搜索模式。
 */
function createRecallMemoryTool(memory: Memory): Tool<RecallMemoryInput, unknown> {
  return tool({
    description: '浏览本地长期记忆和情景记忆历史。使用 messages 查看内容，使用 threads 查看会话。',
    inputSchema: jsonSchema<RecallMemoryInput>({
      type: 'object',
      properties: {
        mode: {
          type: 'string',
          enum: ['messages', 'threads'],
          description: '要浏览的历史类型，默认使用 messages',
        },
        threadId: {
          type: 'string',
          minLength: 1,
          description: 'threads 返回的会话 ID；使用 current 表示当前会话',
        },
        cursor: {
          type: 'string',
          minLength: 1,
          description: '作为分页游标的消息 ID',
        },
        anchor: {
          type: 'string',
          enum: ['start', 'end'],
          description: '未提供游标时，从最早或最新一端开始浏览',
        },
        page: {
          type: 'integer',
          minimum: -50,
          maximum: 50,
          description: '相对于游标的分页偏移',
        },
        limit: {
          type: 'integer',
          minimum: 1,
          maximum: 20,
          description: '最多返回的条目数，默认为 20',
        },
        detail: {
          type: 'string',
          enum: ['low', 'high'],
          description: '返回精简内容或完整内容',
        },
      },
      additionalProperties: false,
    }),
    execute: input => memory.recallHistory(input),
  });
}

/**
 * 创建由 Nucleus 内置 Agent 独占的记忆工具集合。
 */
export function createMemoryTools(memory: Memory) {
  return {
    memory_recall: createRecallMemoryTool(memory),
    memory_remember: createRememberMemoryTool(memory),
  };
}
