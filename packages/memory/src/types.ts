import type { AgentTool } from '@earendil-works/pi-agent-core';
import type { EmbeddingModel } from 'ai';
import type { AgentConfig, ProjectorExtension } from 'corex';

/**
 * 用于隔离同一场景或主体记忆的稳定标识
 */
export interface MemoryScope {
  readonly id: string;
  readonly label: string;
}

export type MemoryScopeValue = MemoryScope | 'global';

/**
 * 控制读取当前 Scope、全局事实或两者
 */
export type MemoryScopeRange = 'current' | 'global' | 'all';
export type MemoryKind = 'daily' | 'long-term';

/**
 * 按自然日保存的不可变事实
 */
export interface DailyMemoryEntry {
  readonly id: string;
  readonly date: string;
  readonly scope: MemoryScopeValue;
  readonly content: string;
  readonly occurredAt: number;
  readonly createdAt: number;
  readonly idempotencyKey?: string;
}

/**
 * 整合后长期记忆的单个追加式版本
 */
export interface LongTermMemoryRevision {
  readonly id: string;
  readonly scope: MemoryScopeValue;
  readonly content: string;
  readonly revision: number;
  readonly basedOnDates: readonly string[];
  readonly createdAt: number;
}

/**
 * 确定性搜索返回的通用结构
 */
export interface MemorySearchResult {
  readonly id: string;
  readonly kind: MemoryKind;
  readonly scope: MemoryScopeValue;
  readonly content: string;
  readonly date?: string;
  readonly revision?: number;
  readonly occurredAt?: number;
  readonly createdAt: number;
}

export interface MemorySearchPage {
  readonly entries: readonly MemorySearchResult[];
  readonly cursor?: string;
}

export interface MemoryRecall extends MemorySearchResult {
  /**
   * Store 在 Agent 重排前提供的向量相似度分数
   */
  readonly score: number;
}

export interface RememberMemoryInput {
  readonly content: string;
  readonly scope: 'current' | 'global';
  readonly occurredAt?: number;
  readonly idempotencyKey?: string;
}

export interface UpdateMemoryInput {
  readonly instruction: string;
  readonly scope: 'current' | 'global';
}

export interface RecallMemoryInput {
  readonly query: string;
  readonly scope?: MemoryScopeRange;
  readonly limit?: number;
}

export interface SearchMemoryInput {
  readonly query?: string;
  readonly scope?: MemoryScopeRange;
  readonly kinds?: readonly MemoryKind[];
  readonly from?: string;
  readonly to?: string;
  readonly limit?: number;
  readonly cursor?: string;
}

export interface MemoryStoreOptions {
  /**
   * PGlite 数据目录,`:memory:` 创建纯内存数据库
   */
  readonly path: string;
}

export interface AppendDailyMemoryOptions {
  readonly namespaceId: string;
  readonly scope: MemoryScopeValue;
  readonly date: string;
  readonly content: string;
  readonly embedding: readonly number[];
  readonly occurredAt: number;
  readonly createdAt: number;
  readonly idempotencyKey?: string;
}

export interface CommitLongTermMemoryOptions {
  readonly namespaceId: string;
  readonly scope: MemoryScopeValue;
  readonly content: string;
  readonly embedding: readonly number[];
  readonly basedOnDates: readonly string[];
  readonly createdAt: number;
}

export interface MemoryStoreSearchOptions extends SearchMemoryInput {
  readonly namespaceId: string;
  readonly currentScope?: MemoryScope;
}

export interface MemoryStoreRecallOptions {
  readonly namespaceId: string;
  readonly currentScope?: MemoryScope;
  readonly embedding: readonly number[];
  readonly scope: MemoryScopeRange;
  readonly limit: number;
}

export interface PendingMemoryDate {
  readonly date: string;
  readonly scope: MemoryScopeValue;
}

/**
 * 持久化边界,自定义 Store 可替换内置 PGlite Store
 */
export interface MemoryStore {
  start(): Promise<void>;
  close(): Promise<void>;
  appendDaily(options: AppendDailyMemoryOptions): Promise<DailyMemoryEntry>;
  commitLongTerm(options: CommitLongTermMemoryOptions): Promise<LongTermMemoryRevision>;
  latestLongTerm(
    namespaceId: string,
    scope: MemoryScopeValue,
  ): Promise<LongTermMemoryRevision | undefined>;
  listDaily(
    namespaceId: string,
    scope: MemoryScopeValue,
    options?: { readonly dates?: readonly string[]; readonly limit?: number },
  ): Promise<readonly DailyMemoryEntry[]>;
  listPendingDates(namespaceId: string, beforeDate: string): Promise<readonly PendingMemoryDate[]>;
  markDateConsolidated(namespaceId: string, scope: MemoryScopeValue, date: string): Promise<void>;
  search(options: MemoryStoreSearchOptions): Promise<MemorySearchPage>;
  recall(options: MemoryStoreRecallOptions): Promise<readonly MemoryRecall[]>;
}

/**
 * 隔离 Memory Agent 使用的各操作提示词
 */
export interface MemoryPrompts {
  readonly summarizeDaily: string;
  readonly consolidateLongTerm: string;
  readonly reviseLongTerm: string;
  readonly recall: string;
}

/**
 * 运行时内部使用的完整 Agent 配置
 */
export interface MemoryAgentOptions extends AgentConfig {
  readonly instructions: string;
  readonly prompts: MemoryPrompts;
}

/**
 * 控制哪些已存记忆会投影进主 Agent 上下文
 */
export interface MemoryProjectorOptions {
  readonly recentDays?: number;
  readonly maxEntriesPerDay?: number;
  readonly includeGlobalLongTerm?: boolean;
  readonly includeCurrentLongTerm?: boolean;
}

/**
 * 生成的记忆工具使用的默认限制与 Scope
 */
export interface MemoryToolOptions {
  readonly defaultRecallRange?: MemoryScopeRange;
  readonly recallLimit?: number;
  readonly searchLimit?: number;
}

/**
 * {@link memoryPlugin} 接受的公开配置
 */
export interface MemoryOptions {
  readonly name: string;
  readonly description?: string;
  readonly id?: string;
  readonly scope?: () => MemoryScope | undefined;
  readonly store: MemoryStoreOptions | MemoryStore;
  readonly embedder: EmbeddingModel;
  readonly instructions?: string;
  readonly prompts?: Partial<MemoryPrompts>;
  readonly agent?: Partial<AgentConfig>;
  readonly projector?: MemoryProjectorOptions;
  readonly tools?: MemoryToolOptions;
  readonly now?: () => number;
}

/**
 * 底层运行时工厂接受的已解析配置
 */
export interface CreateMemoryOptions extends Omit<
  MemoryOptions,
  'agent' | 'description' | 'id' | 'name'
> {
  readonly id: string;
  readonly agent: MemoryAgentOptions;
}

/**
 * 向 Plugin 和高级调用方暴露的运行时资源
 */
export interface MemoryRuntime {
  readonly projector: ProjectorExtension;
  readonly tools: readonly AgentTool<any>[];
  start(): Promise<void>;
  flush(): Promise<void>;
  close(): Promise<void>;
}
