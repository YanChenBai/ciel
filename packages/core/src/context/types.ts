import type { Percept } from '#percepts';

export interface ContextOptions {
  /**
   * 每次快照保留的最近感知时长，单位为毫秒
   */
  perceptWindow?: number;

  /**
   * 附加到场景与信号语义之前的基础定义
   */
  definitions?: readonly ContextDefinitionInput[];
}

export interface ContextDefinitionInput {
  /**
   * 定义在 system prompt 中显示的名称。
   */
  readonly name: string;

  /**
   * 定义的语义说明。
   */
  readonly description: string;
}

export type ContextDefinitionKind = 'custom' | 'scene' | 'signal';

/**
 * Context 中的受信任语义定义。场景、信号和运行时补充共用同一种数据结构。
 */
export interface ContextDefinition extends ContextDefinitionInput {
  /**
   * 定义来自应用补充、Stimulus 场景或 Signal。
   */
  readonly kind: ContextDefinitionKind;
}

/**
 * Nucleus 可订阅和读取的最小上下文契约。
 */
export interface ContextSource {
  snapshot(createdAt?: Date): ContextSnapshot;
  on(event: 'change', listener: () => void): () => void;
}

/**
 * 感知或记忆覆盖的时间范围。
 */
export interface ContextTime {
  /**
   * 内容开始发生的时间。
   */
  readonly startAt: Date;

  /**
   * 内容结束发生的时间。
   */
  readonly endAt: Date;
}

/**
 * 可直接放入模型消息的文本内容。
 */
export interface ContextTextContent {
  readonly type: 'text';
  readonly text: string;

  /**
   * 可选的说话人名称或标识。
   */
  readonly speaker?: string;
}

/**
 * 尚未读取、由本地路径指向的图片内容。
 */
export interface ContextImageContent {
  readonly type: 'image';
  readonly path: string;
}

export type ContextContent = ContextTextContent | ContextImageContent;

/**
 * 一条经过感官处理、可以进入当前轮输入的数据。
 */
export interface ContextData {
  readonly signal: ContextDefinition;

  /**
   * 感知发生的时间。
   */
  readonly time: ContextTime;

  /**
   * 已对齐为文本或图片的模型输入。
   */
  readonly content: ContextContent;

  /**
   * 原始 Percept，供非模型消费者继续使用。
   */
  readonly percept: Percept;
}

/**
 * 某一时刻供 Nucleus 消费的 Context 视图。
 */
export interface ContextSnapshot {
  /**
   * 快照生成时间。
   */
  readonly createdAt: Date;

  /**
   * 注入 system prompt 的受信任定义。
   */
  readonly definitions: readonly ContextDefinition[];

  /**
   * 注入当前轮 user message 的实时感知。
   */
  readonly data: readonly ContextData[];
}

/**
 * 身份与行为等可独立组合的 system prompt 配置。
 */
export interface ContextPromptProfile {
  /**
   * “我是谁”以及与用户、世界的关系。
   */
  readonly identity?: string;

  /**
   * 稳定的表达方式、情绪倾向与性格特征。
   */
  readonly personality?: string;

  /**
   * 必须遵守的行为边界。
   */
  readonly rules?: readonly string[];

  /**
   * 世界观、能力说明等任意扩展区块。
   */
  readonly sections?: readonly ContextPromptSection[];
}

/**
 * 一个可扩展的 system prompt 区块。
 */
export interface ContextPromptSection {
  readonly name: string;
  readonly content: string;
}

/**
 * 可按时间注入 Prompt 的文本或图片条目。
 */
export interface ContextPromptEntry {
  readonly name: string;
  readonly description?: string;
  readonly time: ContextTime;
  readonly content: ContextContent;
}

/**
 * Context Prompt 中尚未读取的文本或本地图片。
 */
export type ContextPromptPart =
  | { readonly type: 'text'; readonly text: string }
  | { readonly type: 'image'; readonly path: string };

/**
 * Context 组合完成、可转换为模型消息的 Prompt。
 */
export interface ContextPrompt {
  readonly system: readonly string[];
  readonly input: readonly ContextPromptPart[];
}

export interface ContextPromptInput {
  readonly context: ContextSnapshot;
  readonly trigger: string;
  readonly profile?: ContextPromptProfile;
  readonly systemSections?: readonly ContextPromptSection[];
  readonly longTermMemories?: readonly ContextPromptEntry[];
  readonly episodicMemories?: readonly ContextPromptEntry[];
}

export interface ContextEventMap {
  /**
   * 新感知完成 Context 对齐。
   */
  data(data: ContextData): void;

  /**
   * 定义或实时数据发生变化。
   */
  change(): void;
}
