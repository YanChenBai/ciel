import type { EmbeddingModel, LanguageModel } from 'ai';

import type { PerceptRecord } from '#src/percepts/index.ts';

export type MemoryEmbeddingModel = Exclude<EmbeddingModel, string>;

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
  readonly resourceId?: string;
}

export interface MemoryRecall {
  readonly content: string;
  readonly createdAt: Date;
  readonly id: string;
}

/** Nucleus 与记忆工具共享的最小记忆契约。 */
export interface CielMemoryStore {
  recordEpisode(data: readonly PerceptRecord[], idempotencyKey?: string): Promise<void>;
  readLongTerm(): Promise<string>;
  readRecent(): Promise<string>;
  updateLongTerm(content: string): Promise<void>;
  recall(query: string, limit?: number): Promise<MemoryRecall[]>;
}

export interface RecallMemoryInput {
  /** 用自然语言描述要查找的历史。 */
  readonly query: string;

  /** 最多返回的经历数量。 */
  readonly limit?: number;
}

export interface UpdateMemoryInput {
  /** 精炼后的完整全局记忆。 */
  readonly content: string;
}
