import type { CielData } from '#model/data.ts';
import type { CielDefinition } from '#model/definition.ts';
import type { LLMContext } from '#model/llm/index.ts';
import type { Signal } from '#model/signal/index.ts';
import type { Temporal } from '#shared';
import type { CielMetadata } from '#shared/metadata.ts';

export interface PerceptDefinition extends CielDefinition<'percept-definition'> {
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
  contents: LLMContext;
  /**
   * 感知所对应的时间范围
   */
  temporal: Temporal;
  /**
   * 可选的感知置信度
   */
  confidence?: number;
}

export interface Percept<TSource extends Signal<any> = Signal<any>> extends CielData<'percept'> {
  readonly definition: PerceptDefinition;
  readonly source: TSource;
  readonly contents: LLMContext;
  readonly temporal: Temporal;
  readonly confidence?: number;
}

export type DefinePerceptOptions = CielMetadata;
export type PerceptOf<TDefinition extends PerceptDefinition> = Percept & {
  readonly definition: TDefinition;
};
