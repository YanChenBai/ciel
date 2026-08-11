// @env node

import { randomUUID } from 'node:crypto';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

import { LibSQLStore, LibSQLVector } from '@mastra/libsql';
import { Memory as MastraMemory } from '@mastra/memory';

import {
  DEFAULT_MEMORY_PATH,
  DEFAULT_MEMORY_RECALL_LIMIT,
  DEFAULT_MEMORY_RESOURCE_ID,
  DEFAULT_RECENT_MEMORY_DAYS,
  GLOBAL_MEMORY_THREAD_ID,
  MEMORY_KIND_METADATA,
} from './constants.ts';
import type { MemoryEmbeddingModel, MemoryOptions, MemoryRecall } from './types.ts';

type MastraMemoryOptions = NonNullable<ConstructorParameters<typeof MastraMemory>[0]>;
type MastraEmbedder = NonNullable<MastraMemoryOptions['embedder']>;

const WORKING_MEMORY_CONFIG = {
  enabled: true,
  scope: 'resource',
} as const;

function adaptEmbedder(embedder: MemoryEmbeddingModel): MastraEmbedder {
  if (embedder.specificationVersion !== 'v4') {
    return embedder as MastraEmbedder;
  }

  // Mastra 目前声明 AI SDK v2/v3，v4 的 embedding 调用结构保持兼容。
  return {
    specificationVersion: 'v3',
    provider: embedder.provider,
    modelId: embedder.modelId,
    maxEmbeddingsPerCall: embedder.maxEmbeddingsPerCall,
    supportsParallelCalls: embedder.supportsParallelCalls,
    doEmbed: options => embedder.doEmbed(options as Parameters<typeof embedder.doEmbed>[0]),
  } as MastraEmbedder;
}

function twoDigits(value: number): string {
  return value.toString().padStart(2, '0');
}

function formatDate(date: Date): string {
  return [date.getFullYear(), twoDigits(date.getMonth() + 1), twoDigits(date.getDate())].join('-');
}

function formatTime(date: Date): string {
  return [
    twoDigits(date.getHours()),
    twoDigits(date.getMinutes()),
    twoDigits(date.getSeconds()),
  ].join(':');
}

function resolveDatabaseUrl(databasePath: string): string {
  if (databasePath === ':memory:') {
    return databasePath;
  }
  return pathToFileURL(databasePath).href;
}

function resolveVectorPath(databasePath: string): string {
  if (databasePath === ':memory:') {
    return databasePath;
  }
  const extension = path.extname(databasePath);
  const basename = path.basename(databasePath, extension);
  return path.join(path.dirname(databasePath), `${basename}.vector${extension || '.db'}`);
}

function readMessageText(message: {
  readonly content: {
    readonly parts: readonly unknown[];
  };
}): string {
  const texts: string[] = [];
  for (const part of message.content.parts) {
    if (!part || typeof part !== 'object') {
      continue;
    }
    if ('type' in part && part.type === 'text' && 'text' in part && typeof part.text === 'string') {
      texts.push(part.text);
    }
  }
  return texts.join('\n').trim();
}

/**
 * 用 Mastra Memory 管理全局工作记忆、每日经历与语义召回。
 */
export class Memory {
  private readonly storage: LibSQLStore;
  private readonly vector: LibSQLVector;
  private readonly store: MastraMemory;
  private readonly recentDays: number;
  private readonly recallLimit: number;
  private readonly resourceId: string;
  private readonly ready: Promise<void>;
  private mutation: Promise<void> = Promise.resolve();

  constructor(options: MemoryOptions) {
    const databasePath = options.path ?? DEFAULT_MEMORY_PATH;
    const vectorPath = resolveVectorPath(databasePath);
    this.recentDays = options.recentDays ?? DEFAULT_RECENT_MEMORY_DAYS;
    this.recallLimit = options.recallLimit ?? DEFAULT_MEMORY_RECALL_LIMIT;
    this.resourceId = options.resourceId ?? DEFAULT_MEMORY_RESOURCE_ID;
    this.validatePositiveInteger('recentDays', this.recentDays);
    this.validatePositiveInteger('recallLimit', this.recallLimit);

    this.storage = new LibSQLStore({
      id: 'ciel-memory-storage',
      url: resolveDatabaseUrl(databasePath),
    });
    this.vector = new LibSQLVector({
      id: 'ciel-memory-vector',
      url: resolveDatabaseUrl(vectorPath),
    });
    this.store = new MastraMemory({
      storage: this.storage,
      vector: this.vector,
      embedder: adaptEmbedder(options.embedder),
      options: {
        lastMessages: false,
        semanticRecall: {
          topK: this.recallLimit,
          messageRange: 0,
          scope: 'resource',
          filter: {
            [MEMORY_KIND_METADATA]: 'episode',
          },
        },
        workingMemory: WORKING_MEMORY_CONFIG,
      },
    });
    this.ready = this.initialize(databasePath);
  }

  /** 读取跨日期共享的全局记忆。 */
  async readLongTerm(): Promise<string> {
    await Promise.all([this.ready, this.mutation]);
    const content = await this.store.getWorkingMemory({
      threadId: GLOBAL_MEMORY_THREAD_ID,
      resourceId: this.resourceId,
      memoryConfig: {
        workingMemory: WORKING_MEMORY_CONFIG,
      },
    });
    return content ?? '';
  }

  /** 读取最近若干个日期 thread 中的经历。 */
  async readRecent(): Promise<string> {
    await Promise.all([this.ready, this.mutation]);
    const result = await this.store.listThreads({
      page: 0,
      perPage: this.recentDays,
      orderBy: {
        field: 'createdAt',
        direction: 'DESC',
      },
      filter: {
        resourceId: this.resourceId,
        metadata: {
          [MEMORY_KIND_METADATA]: 'episode',
        },
      },
    });
    const threads = result.threads.toSorted(
      (left, right) => left.createdAt.getTime() - right.createdAt.getTime(),
    );
    const days: string[] = [];
    for (const thread of threads) {
      const recalled = await this.store.recall({
        threadId: thread.id,
        resourceId: this.resourceId,
        page: 0,
        perPage: false,
        orderBy: {
          field: 'createdAt',
          direction: 'ASC',
        },
        threadConfig: {
          lastMessages: false,
          semanticRecall: false,
        },
      });
      const entries = recalled.messages.map(message => {
        return `## ${formatTime(message.createdAt)}\n\n${readMessageText(message)}`;
      });
      days.push(`# ${thread.id}\n\n${entries.join('\n\n')}`);
    }
    return days.join('\n\n');
  }

  /** 整体更新跨日期共享的全局记忆。 */
  updateLongTerm(content: string): Promise<void> {
    return this.mutate(async () => {
      await this.ready;
      await this.store.updateWorkingMemory({
        threadId: GLOBAL_MEMORY_THREAD_ID,
        resourceId: this.resourceId,
        workingMemory: content.trim(),
        memoryConfig: {
          workingMemory: WORKING_MEMORY_CONFIG,
        },
      });
    });
  }

  /** 将一次经历总结写入对应的日期 thread 并建立向量。 */
  appendEpisode(content: string, createdAt: Date = new Date()): Promise<void> {
    return this.mutate(async () => {
      await this.ready;
      const threadId = formatDate(createdAt);
      await this.ensureThread(threadId, createdAt, 'episode');
      await this.store.saveMessages({
        messages: [
          {
            id: randomUUID(),
            role: 'user',
            createdAt,
            threadId,
            resourceId: this.resourceId,
            type: 'text',
            content: {
              format: 2,
              parts: [
                {
                  type: 'text',
                  text: content.trim(),
                },
              ],
              metadata: {
                [MEMORY_KIND_METADATA]: 'episode',
              },
            },
          },
        ],
      });
    });
  }

  /** 按语义搜索跨日期的历史经历。 */
  async recall(query: string, limit: number = this.recallLimit): Promise<MemoryRecall[]> {
    this.validatePositiveInteger('limit', limit);
    const search = query.trim();
    if (!search) {
      return [];
    }
    await Promise.all([this.ready, this.mutation]);
    const result = await this.store.recall({
      threadId: GLOBAL_MEMORY_THREAD_ID,
      resourceId: this.resourceId,
      vectorSearchString: search,
      page: 0,
      perPage: limit,
      threadConfig: {
        lastMessages: false,
        semanticRecall: {
          topK: limit,
          messageRange: 0,
          scope: 'resource',
          filter: {
            [MEMORY_KIND_METADATA]: 'episode',
          },
        },
      },
    });
    return result.messages.map(message => ({
      id: message.id,
      content: readMessageText(message),
      createdAt: message.createdAt,
    }));
  }

  /** 关闭 LibSQL 存储与向量连接。 */
  async close(): Promise<void> {
    await Promise.all([this.ready, this.mutation]);
    await this.vector.close();
    await this.storage.close();
  }

  private async initialize(databasePath: string): Promise<void> {
    if (databasePath !== ':memory:') {
      await mkdir(path.dirname(databasePath), { recursive: true });
    }
    await this.storage.init();
    await this.ensureThread(GLOBAL_MEMORY_THREAD_ID, new Date(0), 'global');
  }

  private async ensureThread(
    threadId: string,
    createdAt: Date,
    kind: 'episode' | 'global',
  ): Promise<void> {
    const existing = await this.store.getThreadById({
      threadId,
      resourceId: this.resourceId,
    });
    if (existing) {
      return;
    }
    await this.store.saveThread({
      thread: {
        id: threadId,
        title: threadId,
        resourceId: this.resourceId,
        createdAt,
        updatedAt: createdAt,
        metadata: {
          [MEMORY_KIND_METADATA]: kind,
        },
      },
    });
  }

  private mutate(operation: () => Promise<void>): Promise<void> {
    const pending = this.mutation.then(operation);
    this.mutation = pending.catch(() => undefined);
    return pending;
  }

  private validatePositiveInteger(name: string, value: number): void {
    if (!Number.isInteger(value) || value <= 0) {
      throw new Error(`memory.${name} must be a positive integer`);
    }
  }
}
