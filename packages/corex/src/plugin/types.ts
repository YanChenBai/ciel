import type { Instrument, Interceptor } from '@ciels/interceptor';
import type { AgentTool } from '@earendil-works/pi-agent-core';

import type { AnyCue } from '#model/cue/index.ts';
import type { EngramView } from '#model/engram/index.ts';
import type { LLMContext } from '#model/llm/index.ts';
import type { Percept } from '#model/percept/index.ts';
import type { AnySignal, AnySignalDefinition, EmitSignal, SignalOf } from '#model/signal/index.ts';
import type { AgentConfig } from '#runtime/agent/index.ts';
import type { Dispose, MaybePromise } from '#shared/async.ts';
import type { CielMetadata } from '#shared/metadata.ts';

export interface SensuResult<TSignal extends AnySignal = AnySignal> {
  readonly percepts?: Percept<TSignal> | readonly Percept<TSignal>[];
  readonly cues?: AnyCue | readonly AnyCue[];
}

export type SensuHandler<TDefinition extends AnySignalDefinition> = (
  signal: SignalOf<TDefinition>,
) => MaybePromise<SensuResult<SignalOf<TDefinition>> | void>;

export type Sensu = <TDefinition extends AnySignalDefinition>(
  definition: TDefinition,
  handler: SensuHandler<TDefinition>,
) => Dispose;

export interface PluginContribution {
  readonly interceptors?: readonly Interceptor[];
  readonly projectors?: readonly AnyProjectorOptions[];
  readonly tools?: readonly AgentTool<any>[];
}

export interface ProjectorContext {
  readonly engram: EngramView;
}

export interface ProjectorOptions<TResult extends LLMContext = LLMContext> extends CielMetadata {
  project(this: void, ctx: ProjectorContext): MaybePromise<TResult>;
}

export type AnyProjectorOptions = ProjectorOptions<LLMContext>;

/**
 * 每个 Plugin 共享的完整运行时上下文。
 */
export interface PluginContext {
  /**
   * 当前 Ciel 的稳定资源标识。
   */
  readonly id: string;
  /**
   * 可供子 Agent 复用的配置；不包含 instructions、会话、Tools 与 prompt。
   */
  readonly agent: AgentConfig;
  readonly emitSignal: EmitSignal;
  /**
   * 使用当前 Ciel 的 @ciels/interceptor 链包装 Plugin 内部操作。
   *
   * Corex 会为有 context 的操作自动追加 pluginId 与 pluginName metadata。
   */
  readonly instrument: Instrument;
  readonly sensu: Sensu;
  onStart(start: Dispose): void;
  onDispose(dispose: Dispose): void;
  provide(contribution: PluginContribution): void;
}

export interface PluginOptions extends CielMetadata, PluginContribution {
  /**
   * 同步声明 Plugin 贡献与生命周期，不应在此启动外部资源。
   */
  setup?(this: void, ctx: PluginContext): void;
}

export interface CielPlugin extends PluginOptions {
  /**
   * Plugin 的 UUIDv7 唯一标识。
   */
  readonly id: string;
}

export type PluginFactory<TOptions> = (options: TOptions) => CielPlugin;

export interface Projector<TResult extends LLMContext = LLMContext>
  extends CielPlugin, ProjectorOptions<TResult> {}
