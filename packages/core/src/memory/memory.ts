// @env node

import { randomUUID } from 'node:crypto';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

import type { MastraDBMessage } from '@mastra/core/agent';
import type { AgentConfig } from '@mastra/core/agent';
import { LibSQLStore } from '@mastra/libsql';
import { Memory as MastraStore } from '@mastra/memory';
import type { LanguageModel } from 'ai';

import type { ContextContent } from '#src/nucleus/types.ts';

import { DEFAULT_MEMORY_PATH } from './constants.ts';
import type {
  EpisodicMemory,
  LongTermMemory,
  MemoryContext,
  MemoryContextOptions,
  MemoryEntry,
  MemoryKind,
} from './types.ts';

const MEMORY_METADATA_KEY = 'ciel_memory';
const MEMORY_ENTRY_METADATA_KEY = 'ciel_memory_entry';

interface StoredMemoryEntry {
  readonly kind: MemoryKind;
  readonly name: string;
  readonly description: string;
  readonly startAt: string;
  readonly endAt: string;
  readonly content: ContextContent;
}

/**
 * 本地长期记忆配置。
 */
export interface MemoryOptions {
  /**
   * 与 Nucleus 共用的模型；用于 Mastra Observer 与 Reflector。
   */
  model: LanguageModel;

  /**
   * LibSQL 文件路径；传入 `:memory:` 可切换为纯内存模式。
   */
  path?: string;

  /**
   * Mastra 存储实例标识。
   */
  storageId?: string;

  /**
   * 当前会话标识。
   */
  threadId?: string;

  /**
   * 跨会话共享记忆的主体标识。
   */
  resourceId?: string;

  /**
   * 累积多少消息 token 后生成观察摘要。
   */
  observationTokens?: number;

  /**
   * 累积多少观察 token 后生成反思摘要。
   */
  reflectionTokens?: number;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function isContextContent(value: unknown): value is ContextContent {
  if (!isRecord(value)) {
    return false;
  }
  return (
    (value.type === 'text' && typeof value.text === 'string') ||
    (value.type === 'image' && typeof value.path === 'string')
  );
}

function readStoredEntry(message: MastraDBMessage): MemoryEntry | undefined {
  const stored = message.content.metadata?.[MEMORY_ENTRY_METADATA_KEY];
  if (
    !isRecord(stored) ||
    (stored.kind !== 'long-term' && stored.kind !== 'episodic') ||
    typeof stored.name !== 'string' ||
    typeof stored.description !== 'string' ||
    typeof stored.startAt !== 'string' ||
    typeof stored.endAt !== 'string' ||
    !isContextContent(stored.content)
  ) {
    return undefined;
  }

  return {
    id: message.id,
    kind: stored.kind,
    name: stored.name,
    description: stored.description,
    time: {
      startAt: new Date(stored.startAt),
      endAt: new Date(stored.endAt),
    },
    content: stored.content,
  };
}

function entryText(entry: MemoryEntry): string {
  const content = entry.content.type === 'text' ? entry.content.text : entry.content.path;
  return `# ${entry.name}\n${entry.description}\n\n${content}`;
}

/**
 * 基于 Mastra Memory 与 LibSQL 的唯一长期记忆实现。
 * 文件路径负责持久化，`:memory:` 负责测试或临时运行，两者共享同一套行为。
 */
export class Memory {
  readonly threadId: string;
  readonly resourceId: string;

  private readonly storage: LibSQLStore;
  private readonly store: MastraStore;
  private readonly ready: Promise<void>;
  private mutation: Promise<void> = Promise.resolve();

  constructor(options: MemoryOptions) {
    const memoryPath = options.path ?? DEFAULT_MEMORY_PATH;
    this.threadId = options.threadId ?? 'ciel';
    this.resourceId = options.resourceId ?? 'ciel';
    this.storage = new LibSQLStore({
      id: options.storageId ?? 'ciel-memory',
      url: memoryPath === ':memory:' ? ':memory:' : pathToFileURL(memoryPath).href,
    });
    this.store = new MastraStore({
      storage: this.storage,
      options: {
        observationalMemory: {
          model: options.model as NonNullable<AgentConfig['model']>,
          scope: 'resource',
          retrieval: { scope: 'resource', vector: false },
          ...(options.observationTokens
            ? { observation: { messageTokens: options.observationTokens } }
            : {}),
          ...(options.reflectionTokens
            ? { reflection: { observationTokens: options.reflectionTokens } }
            : {}),
        },
      },
    });
    this.ready = this.initialize(memoryPath);
  }

  /**
   * 保存一条由 Agent 选择的稳定长期记忆。
   */
  rememberLongTerm(entry: LongTermMemory): Promise<void> {
    const operation = this.mutation.then(() =>
      this.persistEntries([{ ...entry, kind: 'long-term' }]),
    );
    this.mutation = operation.catch(() => undefined);
    return operation;
  }

  /**
   * 保存一条由 Nucleus Episode 生命周期生成的情景摘要。
   */
  rememberEpisode(entry: EpisodicMemory): Promise<void> {
    const operation = this.mutation.then(() =>
      this.persistEntries([{ ...entry, kind: 'episodic' }]),
    );
    this.mutation = operation.catch(() => undefined);
    return operation;
  }

  /**
   * 返回 Nucleus 所需的结构化记忆和 Mastra system context。
   */
  async getContext(options: MemoryContextOptions): Promise<MemoryContext> {
    this.validateLimit('longTermLimit', options.longTermLimit);
    this.validateLimit('episodicLimit', options.episodicLimit);
    await Promise.all([this.ready, this.mutation]);
    const [longTerm, episodic, memoryContext] = await Promise.all([
      this.recall('long-term', options.longTermLimit),
      this.recall('episodic', options.episodicLimit),
      this.store.getContext({ threadId: this.threadId, resourceId: this.resourceId }),
    ]);
    return {
      entries: [...longTerm, ...episodic],
      ...(memoryContext.systemMessage ? { instructions: memoryContext.systemMessage } : {}),
    };
  }

  /**
   * 在当前资源与会话范围内执行 Mastra 原生 recall tool。
   */
  async recallHistory(input: object): Promise<unknown> {
    await Promise.all([this.ready, this.mutation]);
    const recall = this.store.listTools().recall;
    if (!recall?.execute) {
      throw new Error('Mastra recall tool is not available');
    }
    type RecallContext = Parameters<NonNullable<typeof recall.execute>>[1];
    return recall.execute(input, {
      memory: this.store,
      agent: { threadId: this.threadId, resourceId: this.resourceId },
    } as unknown as RecallContext);
  }

  /**
   * 关闭 LibSQL 连接并等待尚未完成的写入。
   */
  async close(): Promise<void> {
    await Promise.all([this.ready, this.mutation]);
    await this.storage.close();
  }

  private async initialize(memoryPath: string): Promise<void> {
    if (memoryPath !== ':memory:') {
      await mkdir(path.dirname(memoryPath), { recursive: true });
    }
    const thread = await this.store.getThreadById({
      threadId: this.threadId,
      resourceId: this.resourceId,
    });
    if (!thread) {
      await this.store.createThread({
        threadId: this.threadId,
        resourceId: this.resourceId,
        title: 'Ciel long-term memory',
      });
    }
  }

  private async persistEntries(entries: readonly MemoryEntry[]): Promise<void> {
    await this.ready;
    await this.store.persistMessages(
      entries.map(entry => {
        const stored: StoredMemoryEntry = {
          kind: entry.kind,
          name: entry.name,
          description: entry.description,
          startAt: entry.time.startAt.toISOString(),
          endAt: entry.time.endAt.toISOString(),
          content: entry.content,
        };
        return {
          id: entry.id ?? randomUUID(),
          role: 'user',
          createdAt: entry.time.endAt,
          threadId: this.threadId,
          resourceId: this.resourceId,
          content: {
            format: 2,
            parts: [{ type: 'text', text: entryText(entry) }],
            metadata: {
              [MEMORY_METADATA_KEY]: true,
              ciel_memory_kind: entry.kind,
              [MEMORY_ENTRY_METADATA_KEY]: stored,
            },
          },
        } satisfies MastraDBMessage;
      }),
    );
  }

  private async recall(kind: MemoryKind, limit: number): Promise<readonly MemoryEntry[]> {
    if (limit === 0) {
      return [];
    }
    const recalled = await this.store.recall({
      threadId: this.threadId,
      resourceId: this.resourceId,
      page: 0,
      perPage: limit,
      orderBy: { field: 'createdAt', direction: 'DESC' },
      filter: { metadata: { ciel_memory_kind: kind } },
    });
    return recalled.messages
      .map(readStoredEntry)
      .filter(entry => entry !== undefined)
      .toSorted((left, right) => left.time.startAt.getTime() - right.time.startAt.getTime());
  }

  private validateLimit(name: string, limit: number): void {
    if (!Number.isInteger(limit) || limit < 0) {
      throw new Error(`memory.${name} must be a non-negative integer`);
    }
  }
}
