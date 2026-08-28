import Emittery, { type EmitteryEvent } from 'emittery';

import type { MaybePromise } from '#shared/async.ts';

import type { AsyncEventEmitter, EventHandler } from './types.ts';
type EmitteryListener<T extends object> = (
  event: EmitteryEvent<PropertyKey, T>,
) => MaybePromise<void>;

export function createAsyncEventEmitter<T extends object>(): AsyncEventEmitter<T> {
  const emitter = new Emittery<Record<PropertyKey, T>>();
  const listeners = new WeakMap<EventHandler<T>, EmitteryListener<T>>();

  function resolveListener(handler: EventHandler<T>): EmitteryListener<T> {
    let listener = listeners.get(handler);

    if (!listener) {
      listener = ({ data }) => handler(data as T);
      listeners.set(handler, listener);
    }

    return listener;
  }

  return {
    emit: (event, data) => emitter.emit(event, data),
    on: (event, handler) => emitter.on(event, resolveListener(handler)),
    onAny: handler => emitter.onAny(resolveListener(handler)),
  };
}
