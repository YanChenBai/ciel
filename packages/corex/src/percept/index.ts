import type { Signal } from '../signal/index.ts';
import type { Temporal } from '../temporal/index.ts';
import { type CielData, type CielDefinition, DataType, DefinitionType } from '../types/index.ts';
import { createId } from '../utils/index.ts';

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

export interface PerceptDefinition extends CielDefinition<typeof DefinitionType.Percept> {
  create<TSource extends Signal<any>>(options: CreatePerceptOptions<TSource>): Percept<TSource>;
}

export interface CreatePerceptOptions<TSource extends Signal<any> = Signal<any>> {
  /**
   * 产生该感知的原始 Signal
   */
  source: TSource;

  /**
   * 供 LLM 直接消费的多模态内容
   */
  contents: PerceptContent[];

  /**
   * 感知所对应的时间范围
   */
  temporal: Temporal;

  /**
   * 可选的感知置信度
   */
  confidence?: number;
}

export interface Percept<TSource extends Signal<any> = Signal<any>> extends CielData<
  typeof DataType.Percept
> {
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
    ...options,

    type: DefinitionType.Percept,

    id: createId(),

    create<TSource extends Signal<any>>(options: CreatePerceptOptions<TSource>): Percept<TSource> {
      return {
        type: DataType.Percept,
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
