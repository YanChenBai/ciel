import type { AnyCue, AnyCueDefinition, CueOf } from '../../cue/index.ts';
import type { Dispose, MaybePromise } from '../../types/index.ts';
import { createAsyncEventEmitter } from './emitter.ts';

type CueHandler = (cue: AnyCue) => MaybePromise<void>;

export interface CueListener {
  onCue<TDefinition extends AnyCueDefinition>(
    definition: TDefinition,
    handler: (cue: CueOf<TDefinition>) => MaybePromise<void>,
  ): Dispose;
}

export interface CueBus extends CueListener {
  emitCue(cue: AnyCue): Promise<void>;
}

export function createCueBus(): CueBus {
  const emitter = createAsyncEventEmitter<AnyCue>();

  function onCue<TDefinition extends AnyCueDefinition>(
    definition: TDefinition,
    handler: (cue: CueOf<TDefinition>) => MaybePromise<void>,
  ): Dispose {
    const cueHandler = handler as CueHandler;
    return emitter.on(definition.id, cueHandler);
  }

  async function emitCue(cue: AnyCue): Promise<void> {
    await emitter.emit(cue.definition.id, cue);
  }

  return {
    emitCue,
    onCue,
  };
}
