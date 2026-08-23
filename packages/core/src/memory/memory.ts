// @env node

import { randomUUID } from 'node:crypto';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

import { LibSQLStore, LibSQLVector } from '@mastra/libsql';
import { Memory as MastraMemory } from '@mastra/memory';

import type { PerceptRecord } from '#percepts';
import { VigiliaChannel } from '#vigilia';

import {
  DEFAULT_MEMORY_PATH,
  DEFAULT_MEMORY_RECALL_LIMIT,
  DEFAULT_RECENT_MEMORY_DAYS,
  MEMORY_KIND_METADATA,
  MEMORY_SCOPE_ID_METADATA,
  MEMORY_SCOPE_LABEL_METADATA,
} from './constants.ts';
import { EpisodeSummarizer } from './episode-summarizer.ts';
import { MemoryOperations } from './operations.ts';
import { createScopedMemoryId, normalizeMemoryResourceId } from './resource-id.ts';
import type {
  EpisodeRecordResult,
  CielMemoryStore,
  MemoryEmbeddingModel,
  MemoryOptions,
  MemoryOperationOptions,
  MemoryRecall,
  MemoryRecallOptions,
  MemoryScope,
} from './types.ts';

type MastraMemoryOptions = NonNullable<ConstructorParameters<typeof MastraMemory>[0]>;
type MastraEmbedder = NonNullable<MastraMemoryOptions['embedder']>;

const WORKING_MEMORY_CONFIG = {
  enabled: true,
  scope: 'resource',
} as const;

const SCOPED_WORKING_MEMORY_CONFIG = {
  enabled: true,
  scope: 'thread',
} as const;

const MEMORY_SCOPE_PREFIX = '[CielMemoryScope] ';
const GLOBAL_EPISODE_SCOPE = { id: 'global', label: '全局经历' } as const;

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

function readMessageScope(message: {
  readonly content: {
    readonly metadata?: unknown;
    readonly parts: readonly unknown[];
  };
}): MemoryScope | undefined {
  const metadata = message.content.metadata;
  if (metadata && typeof metadata === 'object') {
    const id = Reflect.get(metadata, MEMORY_SCOPE_ID_METADATA);
    const label = Reflect.get(metadata, MEMORY_SCOPE_LABEL_METADATA);
    if (typeof id === 'string' && typeof label === 'string') return { id, label };
  }
  return parseScopedContent(readMessageText(message)).scope;
}

function formatScopedContent(content: string, scope?: MemoryScope): string {
  if (!scope) return content;
  return `[记忆来源：${scope.label}；scope=${scope.id}]\n${content}`;
}

function encodeScopedContent(content: string, scope?: MemoryScope): string {
  if (!scope) return content.trim();
  return `${MEMORY_SCOPE_PREFIX}${JSON.stringify(scope)}\n${content.trim()}`;
}

function parseScopedContent(content: string): { content: string; scope?: MemoryScope } {
  if (!content.startsWith(MEMORY_SCOPE_PREFIX)) return { content };
  const lineEnd = content.indexOf('\n');
  if (lineEnd < 0) return { content };
  try {
    const parsed = JSON.parse(content.slice(MEMORY_SCOPE_PREFIX.length, lineEnd)) as unknown;
    if (!parsed || typeof parsed !== 'object') return { content };
    const id = Reflect.get(parsed, 'id');
    const label = Reflect.get(parsed, 'label');
    if (typeof id !== 'string' || typeof label !== 'string') return { content };
    return { content: content.slice(lineEnd + 1).trim(), scope: { id, label } };
  } catch {
    return { content };
  }
}

function normalizeMemoryScope(scope: MemoryScope): MemoryScope {
  const id = scope.id.trim();
  const label = scope.label.trim();
  if (!id) throw new TypeError('memory.scope.id must not be empty');
  if (!label) throw new TypeError('memory.scope.label must not be empty');
  return { id, label };
}

/**
 * 用 Mastra Memory 管理全局工作记忆、每日经历与语义召回。
 */
export class Memory implements CielMemoryStore {
  readonly observations = new VigiliaChannel();
  private readonly storage: LibSQLStore;
  private readonly vector: LibSQLVector;
  private readonly store: MastraMemory;
  private readonly summarizer: EpisodeSummarizer;
  private readonly recentDays: number;
  private readonly recallLimit: number;
  private readonly resourceId: string;
  private readonly globalThreadId: string;
  private readonly ready: Promise<void>;
  private readonly operations = new MemoryOperations(this.observations);
  private mutation: Promise<void> = Promise.resolve();

  constructor(options: MemoryOptions) {
    const databasePath = options.path ?? DEFAULT_MEMORY_PATH;
    const vectorPath = resolveVectorPath(databasePath);
    this.recentDays = options.recentDays ?? DEFAULT_RECENT_MEMORY_DAYS;
    this.recallLimit = options.recallLimit ?? DEFAULT_MEMORY_RECALL_LIMIT;
    this.resourceId = normalizeMemoryResourceId(options.resourceId);
    this.globalThreadId = createScopedMemoryId(this.resourceId, 'global');
    this.summarizer = new EpisodeSummarizer(options.model);
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
  async recordEpisode(
    data: readonly PerceptRecord[],
    idempotencyKey?: string,
    options?: MemoryOperationOptions,
  ): Promise<EpisodeRecordResult | void> {
    return this.operations.observe(
      'record-episode',
      async () => {
        const episode = await this.summarizer.summarize(data);
        if (!episode) return;
        await this.persistEpisode(
          episode.summary,
          episode.createdAt,
          idempotencyKey,
          options?.scope,
        );
        return episode;
      },
      options?.context,
      { recordCount: data.length },
    );
  }

  /** 读取跨日期共享的全局记忆。 */
  readLongTerm(options?: MemoryOperationOptions): Promise<string> {
    return this.operations.observe(
      'read-long-term',
      async () => {
        await Promise.all([this.ready, this.mutation]);
        const globalContent = await this.store.getWorkingMemory({
          threadId: this.globalThreadId,
          resourceId: this.resourceId,
          memoryConfig: {
            workingMemory: WORKING_MEMORY_CONFIG,
          },
        });
        if (!options?.scope) return globalContent ?? '';

        const scope = normalizeMemoryScope(options.scope);
        const threadId = this.createScopeThreadId(scope);
        const thread = await this.store.getThreadById({ threadId, resourceId: this.resourceId });
        const scopedContent = thread
          ? await this.store.getWorkingMemory({
              threadId,
              resourceId: this.resourceId,
              memoryConfig: { workingMemory: SCOPED_WORKING_MEMORY_CONFIG },
            })
          : undefined;
        return [
          globalContent?.trim() ? `## 全局记忆\n\n${globalContent.trim()}` : '',
          scopedContent?.trim() ? `## ${scope.label}\n\n${scopedContent.trim()}` : '',
        ]
          .filter(Boolean)
          .join('\n\n');
      },
      options?.context,
    );
  }

  /** 读取最近若干个日期 thread 中的经历。 */
  readRecent(options?: MemoryOperationOptions): Promise<string> {
    return this.operations.observe(
      'read-recent',
      async () => {
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
              ...(options?.scope ? { [MEMORY_SCOPE_ID_METADATA]: options.scope.id } : {}),
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
          const entries = recalled.messages.flatMap(message => {
            const parsed = parseScopedContent(readMessageText(message));
            const scope = readMessageScope(message) ?? parsed.scope;
            if (options?.scope && scope?.id !== options.scope.id && scope !== undefined) return [];
            const content = formatScopedContent(parsed.content, scope);
            return [`## ${formatTime(message.createdAt)}\n\n${content}`];
          });
          if (entries.length > 0) days.push(`# ${thread.title}\n\n${entries.join('\n\n')}`);
        }
        return days.join('\n\n');
      },
      options?.context,
    );
  }

  /** 整体更新跨日期共享的全局记忆。 */
  updateLongTerm(content: string, options?: MemoryOperationOptions): Promise<void> {
    return this.operations.observe(
      'update-long-term',
      () =>
        this.mutate(async () => {
          await this.ready;
          const scope = options?.scope ? normalizeMemoryScope(options.scope) : undefined;
          const threadId = scope ? this.createScopeThreadId(scope) : this.globalThreadId;
          if (scope) await this.ensureThread(threadId, scope.label, new Date(), 'scope', scope);
          await this.store.updateWorkingMemory({
            threadId,
            resourceId: this.resourceId,
            workingMemory: content.trim(),
            memoryConfig: {
              workingMemory: scope ? SCOPED_WORKING_MEMORY_CONFIG : WORKING_MEMORY_CONFIG,
            },
          });
        }),
      options?.context,
    );
  }

  /** 将一次经历总结写入对应的日期 thread 并建立向量。 */
  appendEpisode(
    content: string,
    createdAt: Date = new Date(),
    idempotencyKey?: string,
    options?: MemoryOperationOptions,
  ): Promise<void> {
    return this.operations.observe(
      'append-episode',
      () => this.persistEpisode(content, createdAt, idempotencyKey, options?.scope),
      options?.context,
    );
  }

  private persistEpisode(
    content: string,
    createdAt: Date,
    idempotencyKey?: string,
    rawScope?: MemoryScope,
  ): Promise<void> {
    return this.mutate(async () => {
      await this.ready;
      const scope = rawScope ? normalizeMemoryScope(rawScope) : GLOBAL_EPISODE_SCOPE;
      const date = formatDate(createdAt);
      const threadId = createScopedMemoryId(this.resourceId, `episode:${scope.id}:${date}`);
      await this.ensureThread(threadId, date, createdAt, 'episode', scope);
      await this.store.saveMessages({
        messages: [
          {
            id: createScopedMemoryId(
              this.resourceId,
              idempotencyKey ? `${scope.id}:${idempotencyKey}` : randomUUID(),
            ),
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
                  text: encodeScopedContent(content, scope),
                },
              ],
              metadata: {
                [MEMORY_KIND_METADATA]: 'episode',
                ...(scope
                  ? {
                      [MEMORY_SCOPE_ID_METADATA]: scope.id,
                      [MEMORY_SCOPE_LABEL_METADATA]: scope.label,
                    }
                  : {}),
              },
            },
          },
        ],
      });
    });
  }

  /** 按语义搜索跨日期的历史经历。 */
  recall(query: string, options?: MemoryRecallOptions): Promise<MemoryRecall[]> {
    const limit = options?.limit ?? this.recallLimit;
    return this.operations.observe(
      'recall',
      async () => {
        this.validatePositiveInteger('limit', limit);
        const search = query.trim();
        if (!search) return [];
        await Promise.all([this.ready, this.mutation]);
        const range = options?.range ?? (options?.scope ? 'current' : 'all');
        if (range === 'current' && !options?.scope) return [];
        const scopes =
          range === 'current' ? [options?.scope] : range === 'global' ? [GLOBAL_EPISODE_SCOPE] : [];
        const results: MemoryRecall[][] = [];
        if (range === 'all') {
          results.push(await this.recallFromScope(search, limit, undefined, false));
        } else {
          for (const scope of scopes) {
            results.push(await this.recallFromScope(search, limit, scope));
          }
        }
        const unique = new Map<string, MemoryRecall>();
        for (const message of results.flat()) unique.set(message.id, message);
        return [...unique.values()].slice(0, limit);
      },
      options?.context,
      { limit, query },
    );
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
    kind: 'episode' | 'global' | 'scope',
    scope?: MemoryScope,
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
          ...(scope
            ? {
                [MEMORY_SCOPE_ID_METADATA]: scope.id,
                [MEMORY_SCOPE_LABEL_METADATA]: scope.label,
              }
            : {}),
        },
      },
    });
  }

  private createScopeThreadId(scope: MemoryScope): string {
    return createScopedMemoryId(this.resourceId, `scope:${scope.id}`);
  }

  private async recallFromScope(
    query: string,
    limit: number,
    scope?: MemoryScope,
    filterByScope = true,
  ): Promise<MemoryRecall[]> {
    const candidateLimit = filterByScope ? Math.max(limit, this.recallLimit) : limit;
    const result = await this.store.recall({
      threadId: this.globalThreadId,
      resourceId: this.resourceId,
      vectorSearchString: query,
      page: 0,
      perPage: candidateLimit,
      threadConfig: {
        lastMessages: false,
        semanticRecall: {
          topK: candidateLimit,
          messageRange: 0,
          scope: 'resource',
          filter: {
            [MEMORY_KIND_METADATA]: 'episode',
            ...(scope ? { [MEMORY_SCOPE_ID_METADATA]: scope.id } : {}),
          },
        },
      },
    });
    return result.messages
      .filter(message => {
        if (!filterByScope) return true;
        const messageScope = readMessageScope(message);
        return scope ? messageScope?.id === scope.id : messageScope === undefined;
      })
      .map(message => {
        const parsed = parseScopedContent(readMessageText(message));
        const messageScope = readMessageScope(message) ?? parsed.scope;
        return {
          id: message.id,
          content: parsed.content,
          createdAt: message.createdAt,
          ...(messageScope ? { scope: messageScope } : {}),
        };
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
