// @env node

import { randomUUID } from 'node:crypto';
import { mkdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

import { LibSQLStore, LibSQLVector } from '@mastra/libsql';
import { Memory as MastraMemory } from '@mastra/memory';
import { generateText } from 'ai';
import type { FilePart, LanguageModel, TextPart } from 'ai';

import type { PerceptRecord } from '#src/percepts/index.ts';

import {
  DEFAULT_MEMORY_PATH,
  DEFAULT_MEMORY_RECALL_LIMIT,
  DEFAULT_MEMORY_RESOURCE_ID,
  DEFAULT_RECENT_MEMORY_DAYS,
  MEMORY_KIND_METADATA,
} from './constants.ts';
import type {
  CielMemoryStore,
  MemoryEmbeddingModel,
  MemoryOptions,
  MemoryRecall,
} from './types.ts';

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

function formatRange(time: PerceptRecord['time']): string {
  const startAt = time.startAt.toISOString();
  const endAt = time.endAt.toISOString();
  return startAt === endAt ? startAt : `${startAt} - ${endAt}`;
}

async function resolveImagePart(imagePath: string): Promise<FilePart> {
  return {
    type: 'file',
    mediaType: 'image/jpeg',
    data: {
      type: 'data',
      data: (await readFile(imagePath)).toString('base64'),
    },
  };
}

/**
 * Mastra 的 thread 与 message ID 是全局主键，因此所有持久化 ID 都必须纳入 resourceId 命名空间。
 */
function createScopedId(resourceId: string, id: string): string {
  return `${encodeURIComponent(resourceId)}:${id}`;
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
export class Memory implements CielMemoryStore {
  private readonly storage: LibSQLStore;
  private readonly vector: LibSQLVector;
  private readonly store: MastraMemory;
  private readonly recentDays: number;
  private readonly recallLimit: number;
  private readonly model: LanguageModel;
  private readonly resourceId: string;
  private readonly globalThreadId: string;
  private readonly ready: Promise<void>;
  private mutation: Promise<void> = Promise.resolve();

  constructor(options: MemoryOptions) {
    const databasePath = options.path ?? DEFAULT_MEMORY_PATH;
    const vectorPath = resolveVectorPath(databasePath);
    this.recentDays = options.recentDays ?? DEFAULT_RECENT_MEMORY_DAYS;
    this.recallLimit = options.recallLimit ?? DEFAULT_MEMORY_RECALL_LIMIT;
    this.model = options.model;
    this.resourceId = (options.resourceId ?? DEFAULT_MEMORY_RESOURCE_ID).trim();
    if (!this.resourceId) throw new Error('memory.resourceId must not be empty');
    this.globalThreadId = createScopedId(this.resourceId, 'global');
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

  /** 将一批感知记录总结并持久化为一次经历。 */
  async recordEpisode(data: readonly PerceptRecord[], idempotencyKey?: string): Promise<void> {
    if (data.length === 0) {
      return;
    }
    const content: Array<TextPart | FilePart> = [];
    for (const entry of data) {
      const header = `[${entry.stimulusDefinition.name} / ${entry.signal.name}]\n[${formatRange(entry.time)}]`;
      if (entry.content.type === 'image') {
        content.push({ type: 'text', text: header });
        content.push(await resolveImagePart(entry.content.path));
      } else {
        const speaker = entry.content.speaker ? `[${entry.content.speaker}] ` : '';
        content.push({ type: 'text', text: `${header} ${speaker}${entry.content.text}` });
      }
    }
    const result = await generateText({
      model: this.model,
      system: '将这段经历总结为简洁、客观、过去时的纯文本。只记录实际发生的事情，不推测。',
      messages: [{ role: 'user', content }],
    });
    const summary = result.text.trim();
    if (!summary) {
      throw new Error('Episode summarizer returned an empty summary');
    }
    const createdAt = new Date(Math.max(...data.map(entry => entry.time.endAt.getTime())));
    await this.appendEpisode(summary, createdAt, idempotencyKey);
  }

  /** 读取跨日期共享的全局记忆。 */
  async readLongTerm(): Promise<string> {
    await Promise.all([this.ready, this.mutation]);
    const content = await this.store.getWorkingMemory({
      threadId: this.globalThreadId,
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
      days.push(`# ${thread.title}\n\n${entries.join('\n\n')}`);
    }
    return days.join('\n\n');
  }

  /** 整体更新跨日期共享的全局记忆。 */
  updateLongTerm(content: string): Promise<void> {
    return this.mutate(async () => {
      await this.ready;
      await this.store.updateWorkingMemory({
        threadId: this.globalThreadId,
        resourceId: this.resourceId,
        workingMemory: content.trim(),
        memoryConfig: {
          workingMemory: WORKING_MEMORY_CONFIG,
        },
      });
    });
  }

  /** 将一次经历总结写入对应的日期 thread 并建立向量。 */
  appendEpisode(
    content: string,
    createdAt: Date = new Date(),
    idempotencyKey?: string,
  ): Promise<void> {
    return this.mutate(async () => {
      await this.ready;
      const date = formatDate(createdAt);
      const threadId = createScopedId(this.resourceId, `episode:${date}`);
      await this.ensureThread(threadId, date, createdAt, 'episode');
      await this.store.saveMessages({
        messages: [
          {
            id: createScopedId(this.resourceId, idempotencyKey ?? randomUUID()),
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
      threadId: this.globalThreadId,
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
    await this.ensureThread(this.globalThreadId, 'global', new Date(0), 'global');
  }

  private async ensureThread(
    threadId: string,
    title: string,
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
        title,
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
