import { EventEmitter } from '@ciels/event';

import type { AnyCue, AnyCueDefinition, CueOf } from '../../cue/index.ts';
import type { Dispose, MaybePromise } from '../../types/index.ts';

type CueHandler = (cue: AnyCue) => MaybePromise<void>;

interface CueBusEvents {
  [event: string]: (cue: AnyCue) => MaybePromise<void>;
}

function cueEvent(definition: AnyCueDefinition): string {
  return `cue:${definition.id}`;
}

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
  const emitter = new EventEmitter<CueBusEvents>();

  function onCue<TDefinition extends AnyCueDefinition>(
    definition: TDefinition,
    handler: (cue: CueOf<TDefinition>) => MaybePromise<void>,
  ): Dispose {
    const cueHandler = handler as CueHandler;
    return emitter.on(cueEvent(definition), cueHandler);
  }

  async function emitCue(cue: AnyCue): Promise<void> {
    await emitter.emitAsync(cueEvent(cue.definition), cue);
  }

  return {
    emitCue,
    onCue,
  };
}
