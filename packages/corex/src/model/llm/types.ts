/**
 * LLM 可直接消费的文本内容。
 */
export interface LLMTextContent {
  readonly type: 'text';

  readonly text: string;
}

/**
 * LLM 可直接消费的图片内容。
 */
export interface LLMImageContent {
  readonly type: 'image';

  readonly data: string | Uint8Array | URL;

  readonly mimeType?: string;
}

/**
 * LLM 可直接消费的音频内容。
 */
export interface LLMAudioContent {
  readonly type: 'audio';

  readonly data: string | Uint8Array;

  readonly mimeType?: string;
}

export type LLMContent = LLMTextContent | LLMImageContent | LLMAudioContent;

/**
 * 与具体模型供应商无关的多模态 LLM 上下文。
 */
export type LLMContext = readonly LLMContent[];
