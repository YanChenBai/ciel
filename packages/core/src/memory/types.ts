import type { ContextContent, ContextTime } from '#src/nucleus/types.ts';

export type MemoryKind = 'long-term' | 'episodic';

/**
 * 注入 Nucleus 的统一记忆条目。
 */
export interface MemoryEntry {
  /**
   * 存储层生成或外部提供的唯一标识。
   */
  readonly id?: string;

  /**
   * 长期记忆或 Nucleus 总结的情景记忆。
   */
  readonly kind: MemoryKind;

  /**
   * 记忆的语义类别。
   */
  readonly name: string;

  /**
   * 记忆被召回时应如何理解。
   */
  readonly description: string;

  /**
   * 事件发生或事实形成的时间范围。
   */
  readonly time: ContextTime;

  /**
   * 可供模型消费的文本或图片内容。
   */
  readonly content: ContextContent;
}

/**
 * Agent 主动保存的稳定长期记忆。
 */
export type LongTermMemory = Omit<MemoryEntry, 'kind'>;

/**
 * main Agent 对一轮经历生成的情景摘要。
 */
export type EpisodicMemory = Omit<MemoryEntry, 'kind'>;

/**
 * 两类记忆各自的注入窗口。
 */
export interface MemoryContextOptions {
  /**
   * 最多召回多少条长期记忆。
   */
  readonly longTermLimit: number;

  /**
   * 最多召回多少条近期情景记忆。
   */
  readonly episodicLimit: number;
}

export interface MemoryContext {
  /**
   * 本轮自动注入的具体记忆。
   */
  readonly entries: readonly MemoryEntry[];

  /**
   * 应放入模型 system prompt 的长期记忆上下文。
   */
  readonly instructions?: string;
}
