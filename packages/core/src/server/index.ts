import { Elysia, t } from 'elysia';

import { wsHub } from './ws-hub.ts';

export * from './ws-hub.ts';

export interface Message {
  message: string;
}

export const app = new Elysia().ws('/ws', {
  open(ws) {
    wsHub.add(ws);
  },

  close(ws) {
    wsHub.remove(ws);
  },

  response: t.Unsafe<Message>(),
});

export type App = typeof app;
