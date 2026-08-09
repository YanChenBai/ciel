import type { App, Message } from '@ciel/core';
import { treaty } from '@elysia/eden';
import { createNanoEvents } from 'nanoevents';
import { onBeforeUnmount } from 'vue';

const client = treaty<App>('localhost:3000');

type Chat = ReturnType<typeof client.ws.subscribe>;

const emitter = createNanoEvents<{
  message(message: Message): void;
}>();

let chat: Chat | undefined;
let refCount = 0;

function connect() {
  if (chat) return;

  chat = client.ws.subscribe();

  chat.subscribe(event => {
    emitter.emit('message', event.data as Message);
  });
}

function release() {
  refCount--;

  if (refCount > 0) return;

  refCount = 0;
  chat?.close();
  chat = undefined;
}

export function useSubscribe() {
  refCount++;

  if (refCount === 1) {
    connect();
  }

  onBeforeUnmount(release);

  return {
    onMessage(listener: (message: Message) => void) {
      const off = emitter.on('message', listener);

      onBeforeUnmount(off);

      return off;
    },
  };
}
