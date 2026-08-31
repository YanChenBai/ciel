import type { CielData } from '#model/data.ts';
import type { CielDefinition } from '#model/definition.ts';
import type { LLMContext } from '#model/llm/index.ts';
import type { AnySignalDefinition, SignalReference } from '#model/signal/index.ts';
import type { Temporal } from '#shared';
import type { CielMetadata } from '#shared/metadata.ts';

export interface PerceptDefinition extends CielDefinition<'percept-definition'> {
  create(options: CreatePerceptOptions): Percept;
}

export interface CreatePerceptOptions {
  /**
   * 形成该感知的 Signal 定义
   */
  origin: AnySignalDefinition;
  /**
   * 精确因果已知时提供 未知时不伪造单一来源
   */
  causes?: readonly SignalReference[];
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

export interface Percept extends CielData<'percept'> {
  readonly definition: PerceptDefinition;
  readonly origin: AnySignalDefinition;
  readonly causes?: readonly SignalReference[];
  readonly contents: LLMContext;
  readonly temporal: Temporal;
  readonly confidence?: number;
}

export type DefinePerceptOptions = CielMetadata;
export type PerceptOf<TDefinition extends PerceptDefinition> = Percept & {
  readonly definition: TDefinition;
};
