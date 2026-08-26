import type { AnyCue } from '../cue/index.ts';
import type { Percept } from '../percept/index.ts';
import type { AnySignalDefinition, SignalOf } from '../signal/index.ts';
import { type CielModule, type Dispose, type MaybePromise, ModuleType } from '../types/index.ts';
import { createId } from '../utils/index.ts';

export interface SensuSetupContext {
  onSignal<TDefinition extends AnySignalDefinition>(
    definition: TDefinition,
    handler: (signal: SignalOf<TDefinition>) => MaybePromise<void>,
  ): Dispose;

  /**
   * 将已经形成的感知写入 Engram，并在写入成功后派发给观察者
   */
  emitPercept(percept: Percept): Promise<void>;

  /**
   * 派发在感知处理完成后形成的认知线索
   */
  emitCue(cue: AnyCue): Promise<void>;

  onDispose(dispose: Dispose): void;
}

export interface DefineSensuOptions {
  readonly name: string;

  readonly description: string;

  setup(ctx: SensuSetupContext): MaybePromise<void>;
}

export interface Sensu extends DefineSensuOptions, CielModule<typeof ModuleType.Sensu> {}

export function defineSensu(options: DefineSensuOptions): Sensu {
  return {
    ...options,
    type: ModuleType.Sensu,
    id: createId(),
  };
}
