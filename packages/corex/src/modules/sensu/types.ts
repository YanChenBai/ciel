import type { AnyCue } from '#model/cue/index.ts';
import type { Percept } from '#model/percept/index.ts';
import type { AnySignal, AnySignalDefinition, SignalOf } from '#model/signal/index.ts';
import type { CielModule } from '#modules/types.ts';
import type { Dispose, MaybePromise, OnDispose } from '#shared/async.ts';
import type { CielMetadata } from '#shared/metadata.ts';

export interface SensuInterpretation<TSignal extends AnySignal = AnySignal> {
  readonly percepts?: Percept<TSignal> | readonly Percept<TSignal>[];
  readonly cues?: AnyCue | readonly AnyCue[];
}

export type SensuInterpreter<TDefinition extends AnySignalDefinition> = (
  signal: SignalOf<TDefinition>,
) => MaybePromise<SensuInterpretation<SignalOf<TDefinition>> | void>;

export type SensuInterpret = <TDefinition extends AnySignalDefinition>(
  definition: TDefinition,
  interpreter: SensuInterpreter<TDefinition>,
) => Dispose;

export interface SensuSetupContext {
  /**
   * 注册将指定 Signal 解释为 Percept 和 Cue 的处理器
   */
  interpret: SensuInterpret;
  onDispose: OnDispose;
}

export interface DefineSensuOptions extends CielMetadata {
  setup(this: void, ctx: SensuSetupContext): MaybePromise<void>;
}

export interface Sensu extends DefineSensuOptions, CielModule<'sensu'> {}
