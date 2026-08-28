import type { AnyCue, AnyCueDefinition, CueOf } from '#model/cue/index.ts';
import type { Dispose, MaybePromise } from '#shared/async.ts';

import { createAsyncEventEmitter } from './emitter.ts';
import type { CueBus } from './types.ts';

type CueHandler = (cue: AnyCue) => MaybePromise<void>;

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
