import type { AnyCue, AnyCueDefinition, CueHandler, OnCue } from '#model/cue/index.ts';

import { createAsyncEventEmitter } from './emitter.ts';
import type { CueBus } from './types.ts';

type AnyCueHandler = CueHandler<AnyCueDefinition>;

export function createCueBus(): CueBus {
  const emitter = createAsyncEventEmitter<AnyCue>();

  const onCue: OnCue = (definition, handler) => {
    const cueHandler = handler as AnyCueHandler;
    return emitter.on(definition.id, cueHandler);
  };

  async function emitCue(cue: AnyCue): Promise<void> {
    await emitter.emit(cue.definition.id, cue);
  }

  return {
    emitCue,
    onCue,
  };
}
