import type { Instrument, Interceptor } from '@cieljs/instrument';
import type { AgentTool } from '@earendil-works/pi-agent-core';

import type { AnyCue } from '#model/cue/index.ts';
import type { EngramEntry, EngramView } from '#model/engram/index.ts';
import type { LLMContext } from '#model/llm/index.ts';
import type { Percept } from '#model/percept/index.ts';
import type { AnySignal, AnySignalDefinition, EmitSignal, SignalOf } from '#model/signal/index.ts';
import type { AgentConfig } from '#runtime/agent/index.ts';
import type { Ciel } from '#runtime/types.ts';
import type { MaybePromise } from '#shared/async.ts';
import type { CielMetadata } from '#shared/metadata.ts';

export type CielExtensionKind = 'interceptor' | 'plugin' | 'projector' | 'sensu';

export interface CielExtensionBase<TKind extends CielExtensionKind> extends CielMetadata {
  readonly id: string;
  readonly kind: TKind;
}

export interface ProjectorContext {
  readonly engram: EngramView;
}

export interface DefineProjectorOptions<
  TResult extends LLMContext = LLMContext,
> extends CielMetadata {
  project(this: void, context: ProjectorContext): MaybePromise<TResult>;
}

export interface ProjectorExtension<
  TResult extends LLMContext = LLMContext,
> extends CielExtensionBase<'projector'> {
  project(this: void, context: ProjectorContext): MaybePromise<TResult>;
}

export type AnyProjectorExtension = ProjectorExtension<LLMContext>;

export interface SensuResult {
  readonly percepts?: Percept | readonly Percept[];
  readonly cues?: AnyCue | readonly AnyCue[];
}

export interface SensuOutputReceipt {
  readonly entries: readonly EngramEntry[];
  readonly cueCount: number;
}

export interface SensuOutput {
  /**
   * 提交一批相互关联的 Percept 与 Cue Corex 保证先写入 Percept 再排入 Cue
   */
  write(result: SensuResult): Promise<SensuOutputReceipt>;
}

export interface SensuCreateContext {
  readonly instrument: Instrument;
  readonly output: SensuOutput;
}

export interface SensuProcessor<TSignal extends AnySignal = AnySignal> {
  write(signal: TSignal): MaybePromise<void>;
  close(): MaybePromise<void>;
}

export interface DefineSensuOptions<TDefinition extends AnySignalDefinition> extends CielMetadata {
  readonly signal: TDefinition;
  create(
    this: void,
    context: SensuCreateContext,
  ): MaybePromise<SensuProcessor<SignalOf<TDefinition>>>;
}

export interface SensuExtension<
  TDefinition extends AnySignalDefinition = AnySignalDefinition,
> extends CielExtensionBase<'sensu'> {
  readonly signal: TDefinition;
  create(
    this: void,
    context: SensuCreateContext,
  ): MaybePromise<SensuProcessor<SignalOf<TDefinition>>>;
}

export interface InterceptorExtension extends CielExtensionBase<'interceptor'> {
  readonly interceptor: Interceptor;
}

export type PluginCapability = AnyProjectorExtension | SensuExtension;

export interface PluginCreateContext {
  readonly agent: AgentConfig;
  readonly cielId: string;
  readonly instrument: Instrument;
}

export interface PluginRuntimeContext {
  readonly ciel: Ciel;
  readonly emitSignal: EmitSignal;
}

export interface PluginInstance {
  /**
   * 追加到主 Agent 系统提示词的 Plugin 使用规则
   */
  readonly instructions?: string;
  /**
   * 由 Plugin 拥有且共享 Plugin 身份的运行时扩展
   */
  readonly extensions?: readonly PluginCapability[];
  /**
   * 直接贡献给主 Agent 的原生 Tool
   */
  readonly tools?: readonly AgentTool<any>[];
  initialize?(): MaybePromise<void>;
  activate?(context: PluginRuntimeContext): MaybePromise<void>;
  deactivate?(): MaybePromise<void>;
  dispose?(): MaybePromise<void>;
}

export interface PluginOptions extends CielMetadata {
  /**
   * 必须在创建所有 PluginInstance 前静态收集
   */
  readonly interceptors?: readonly Interceptor[];
  create(this: void, context: PluginCreateContext): PluginInstance;
}

export interface CielPlugin extends CielExtensionBase<'plugin'>, PluginOptions {}

export type PluginFactory<TOptions> = (options: TOptions) => CielPlugin;
export type EmptyPluginFactory = () => CielPlugin;

export type SensuFactory<TOptions, TDefinition extends AnySignalDefinition> = (
  options: TOptions,
) => SensuExtension<TDefinition>;
export type EmptySensuFactory<TDefinition extends AnySignalDefinition> =
  () => SensuExtension<TDefinition>;

export type CielExtension =
  | CielPlugin
  | AnyProjectorExtension
  | SensuExtension
  | InterceptorExtension;

export type CielExtensionEntry = CielExtension | readonly CielExtensionEntry[];
