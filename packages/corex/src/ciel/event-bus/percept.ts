import { EventEmitter } from '@ciels/event';

import type { Percept, PerceptDefinition } from '../../percept/index.ts';
import type { Dispose, MaybePromise } from '../../types/index.ts';

export type PerceptHandler = (percept: Percept) => MaybePromise<void>;

interface PerceptBusEvents {
  [event: string]: (percept: Percept) => MaybePromise<void>;
}

const ANY_PERCEPT_EVENT = 'percept:any';

function perceptEvent(definition: PerceptDefinition): string {
  return `percept:${definition.id}`;
}

export interface PerceptListener {
  onAnyPercept(handler: PerceptHandler): Dispose;

  onPercept(definition: PerceptDefinition, handler: PerceptHandler): Dispose;
}

export interface PerceptBus extends PerceptListener {
  emitPercept(percept: Percept): Promise<void>;
}

export function createPerceptBus(): PerceptBus {
  const emitter = new EventEmitter<PerceptBusEvents>();

  function onAnyPercept(handler: PerceptHandler): Dispose {
    return emitter.on(ANY_PERCEPT_EVENT, handler);
  }

  function onPercept(definition: PerceptDefinition, handler: PerceptHandler): Dispose {
    return emitter.on(perceptEvent(definition), handler);
  }

  async function emitPercept(percept: Percept): Promise<void> {
    await emitter.emitAsync(ANY_PERCEPT_EVENT, percept);
    await emitter.emitAsync(perceptEvent(percept.definition), percept);
  }

  return {
    emitPercept,
    onAnyPercept,
    onPercept,
  };
}
