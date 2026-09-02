import type { CielData } from '#model/data.ts';
import type { CielDefinition } from '#model/definition.ts';
import type { Instant } from '#shared';
import type { CielMetadata } from '#shared/metadata.ts';

export interface DefineCueOptions extends CielMetadata {
  /**
   * 合并同一 CueDefinition 尚未开始的 Agent 思考 只保留最新 Cue
   */
  readonly coalesce?: boolean;
  /**
   * 触发此 Cue 时追加到默认 Agent user message 的固定指令。
   */
  readonly prompt?: string;
}

export type CreateCue<TPayload> = undefined extends TPayload
  ? (temporal: Instant, payload?: TPayload) => Cue<TPayload>
  : (temporal: Instant, payload: TPayload) => Cue<TPayload>;

export interface CueDefinition<TPayload = void> extends CielDefinition<'cue-definition'> {
  readonly coalesce?: boolean;
  readonly prompt?: string;
  readonly create: CreateCue<TPayload>;
}

export interface Cue<TPayload = void> extends CielData<'cue'> {
  readonly definition: CueDefinition<TPayload>;
  readonly payload: TPayload;
  readonly temporal: Instant;
}

export type AnyCueDefinition = CueDefinition<any>;
export type AnyCue = Cue<any>;
export type CueOf<TDefinition extends AnyCueDefinition> =
  TDefinition extends CueDefinition<infer TPayload> ? Cue<TPayload> : never;
