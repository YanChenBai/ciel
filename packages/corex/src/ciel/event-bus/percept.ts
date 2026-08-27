import type { Percept, PerceptDefinition } from '../../percept/index.ts';
import type { Dispose, MaybePromise } from '../../types/index.ts';
import { createAsyncEventEmitter } from './emitter.ts';

export type PerceptHandler = (percept: Percept) => MaybePromise<void>;

export interface PerceptListener {
  onAnyPercept(handler: PerceptHandler): Dispose;

  onPercept(definition: PerceptDefinition, handler: PerceptHandler): Dispose;
}

export interface PerceptBus extends PerceptListener {
  emitPercept(percept: Percept): Promise<void>;
}

export function createPerceptBus(): PerceptBus {
  const emitter = createAsyncEventEmitter<Percept>();

  function onAnyPercept(handler: PerceptHandler): Dispose {
    return emitter.onAny(handler);
  }

  function onPercept(definition: PerceptDefinition, handler: PerceptHandler): Dispose {
    return emitter.on(definition.id, handler);
  }

  async function emitPercept(percept: Percept): Promise<void> {
    await emitter.emit(percept.definition.id, percept);
  }

  return {
    emitPercept,
    onAnyPercept,
    onPercept,
  };
}
