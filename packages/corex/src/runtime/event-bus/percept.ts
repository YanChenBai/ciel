import type { Percept, PerceptDefinition, PerceptHandler } from '#model/percept/index.ts';
import type { Dispose } from '#shared/async.ts';

import { createAsyncEventEmitter } from './emitter.ts';
import type { PerceptBus } from './types.ts';

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
