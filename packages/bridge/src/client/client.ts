import { EventEmitter } from '@ciels/event';
import { treaty, type Treaty } from '@elysia/eden';

import type { BridgeMessage } from '#protocol';
import type { App } from '#server';

export function createClient(domain: string | App, config?: Treaty.Config<{}>) {
  const eden = treaty<App>(domain, config);
  type Socket = ReturnType<typeof eden.ws.subscribe>;

  const emitter = new EventEmitter<{
    message(message: BridgeMessage): void;
  }>();

  let socket: Socket | undefined;
  let refCount = 0;
  let reconnectTimer: ReturnType<typeof setTimeout> | undefined;
  let shouldConnect = false;

  function connect() {
    shouldConnect = true;
    if (socket) return;

    const current = eden.ws.subscribe();
    socket = current;

    current.subscribe(event => {
      emitter.emit('message', event.data);
    });
    current.on('close', () => {
      if (socket !== current) return;
      socket = undefined;
      if (!shouldConnect || reconnectTimer) return;
      reconnectTimer = setTimeout(() => {
        reconnectTimer = undefined;
        connect();
      }, 1_000);
    });
  }

  function disconnect() {
    shouldConnect = false;
    if (reconnectTimer) clearTimeout(reconnectTimer);
    reconnectTimer = undefined;
    socket?.close();
    socket = undefined;
  }

  function retain() {
    refCount++;

    if (refCount === 1) {
      connect();
    }

    let released = false;

    return () => {
      if (released) return;
      released = true;

      refCount--;

      if (refCount <= 0) {
        refCount = 0;
        disconnect();
      }
    };
  }

  function onMessage(listener: (message: BridgeMessage) => void) {
    return emitter.on('message', listener);
  }

  return {
    retain,
    connect,
    disconnect,
    onMessage,
  };
}

export type BridgeClient = ReturnType<typeof createClient>;
