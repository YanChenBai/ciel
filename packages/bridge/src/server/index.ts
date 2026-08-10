import { Elysia, t } from 'elysia';

import type { BridgeMessage } from '#protocol';

import { wsChannel } from './ws-channel.ts';

export const app = new Elysia().ws('/ws', {
  open(ws) {
    wsChannel.add(ws);
  },

  close(ws) {
    wsChannel.remove(ws);
  },

  response: t.Unsafe<BridgeMessage>(),
});

export type App = typeof app;
