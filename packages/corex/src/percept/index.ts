import { PERCEPT_DEFINITION_SYMBOL, PERCEPT_SYMBOL } from '#identity';
import type { Signal } from '#signal';
import type { Temporal } from '#temporal';

export interface TextPerceptContent {
  type: 'text';

  text: string;
}

export interface ImagePerceptContent {
  type: 'image';

  data: string | Uint8Array | URL;

  mimeType?: string;
}

export interface AudioPerceptContent {
  type: 'audio';

  data: string | Uint8Array;

  mimeType?: string;
}

export type PerceptContent = TextPerceptContent | ImagePerceptContent | AudioPerceptContent;

export interface PerceptDefinition {
  readonly [PERCEPT_DEFINITION_SYMBOL]: true;

  readonly name: string;

  readonly description: string;

  create(options: CreatePerceptOptions): Percept;
}

export interface CreatePerceptOptions {
  /**
   * 产生该感知的原始 Signal。
   */
  source: Signal;

  /**
   * 供 LLM 直接消费的多模态内容。
   */
  contents: PerceptContent[];

  /**
   * 感知所对应的时间范围。
   *
   * 默认可继承 source.temporal。
   */
  temporal: Temporal;

  /**
   * 可选的感知置信度。
   */
  confidence?: number;
}

export interface Percept<TSource extends Signal = Signal> {
  readonly [PERCEPT_SYMBOL]: true;

  readonly definition: PerceptDefinition;

  readonly source: TSource;

  readonly contents: readonly PerceptContent[];

  readonly temporal: Temporal;

  readonly confidence?: number;
}

export interface DefinePerceptOptions {
  name: string;

  description: string;
}

export function definePercept(options: DefinePerceptOptions): PerceptDefinition {
  const definition: PerceptDefinition = {
    [PERCEPT_DEFINITION_SYMBOL]: true,

    ...options,

    create(options: CreatePerceptOptions): Percept {
      return {
        [PERCEPT_SYMBOL]: true,

        definition,

        contents: options.contents,

        source: options.source,

        temporal: options.temporal,

        confidence: options.confidence,
      };
    },
  };

  return definition;
}
