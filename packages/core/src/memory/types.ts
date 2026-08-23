import type { EmbeddingModel, LanguageModel } from 'ai';

import type { PerceptRecord } from '#percepts';
import type { VigiliaOperationContext, VigiliaSource } from '#vigilia';

export type MemoryEmbeddingModel = Exclude<EmbeddingModel, string>;
export type MemoryResourceSegment = number | string;

/** 同一主体内用于区分场景的稳定记忆作用域。 */
export interface MemoryScope {
  readonly id: string;
  readonly label: string;
}

export interface MemoryOperationOptions {
  readonly context?: VigiliaOperationContext;
  readonly scope?: MemoryScope;
}

export interface MemoryRecallOptions extends MemoryOperationOptions {
  readonly limit?: number;
  /** current 只搜索当前作用域；all 可跨作用域搜索。 */
  readonly range?: 'all' | 'current' | 'global';
}

export interface MemoryOptions {
  /** LibSQL 主数据库路径；向量库会以同目录的 `*.vector.db` 保存。 */
  readonly path?: string;

  /** 用于历史经历语义召回的 embedding model。 */
  readonly embedder: MemoryEmbeddingModel;

  /** 用于将一批感知记录总结为经历的模型。 */
  readonly model: LanguageModel;

  /** 注入上下文的最近日期数量。 */
  readonly recentDays?: number;

  /** 单次语义召回的默认结果数。 */
  readonly recallLimit?: number;

  /** 隔离长期记忆、每日经历、语义召回与幂等 ID 的资源标识。 */
  readonly resourceId: string;
}

export interface MemoryRecall {
  readonly content: string;
  readonly createdAt: Date;
  readonly id: string;
  readonly scope?: MemoryScope;
}

export interface EpisodeRecordResult {
  readonly createdAt: Date;
  readonly summary: string;
}

/** Nucleus 与记忆工具共享的最小记忆契约。 */
export interface CielMemoryStore {
  readonly observations: VigiliaSource;
  recordEpisode(
    data: readonly PerceptRecord[],
    idempotencyKey?: string,
    options?: MemoryOperationOptions,
  ): Promise<EpisodeRecordResult | void>;
  readLongTerm(options?: MemoryOperationOptions): Promise<string>;
  readRecent(options?: MemoryOperationOptions): Promise<string>;
  updateLongTerm(content: string, options?: MemoryOperationOptions): Promise<void>;
  recall(query: string, options?: MemoryRecallOptions): Promise<MemoryRecall[]>;
}

export interface RecallMemoryInput {
  /** 用自然语言描述要查找的历史。 */
  readonly query: string;

  /** 最多返回的经历数量。 */
  readonly limit?: number;

  /** 默认只搜索当前场景；all 会跨场景搜索。 */
  readonly scope?: 'all' | 'current' | 'global';
}

export interface UpdateMemoryInput {
  /** 精炼后的目标作用域完整记忆。 */
  readonly content: string;

  /** 写入全局记忆或当前场景记忆。 */
  readonly scope: 'current' | 'global';
}
