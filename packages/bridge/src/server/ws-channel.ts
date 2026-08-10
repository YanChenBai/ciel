import type { ElysiaWS } from 'elysia/ws';

import type { BridgeMessage } from '#protocol';

class WsChannel {
  private clients = new Set<ElysiaWS>();

  add(ws: ElysiaWS) {
    this.clients.add(ws);
  }

  remove(ws: ElysiaWS) {
    this.clients.delete(ws);
  }

  emit(data: BridgeMessage) {
    for (const ws of this.clients) {
      if (ws.readyState === 1) {
        ws.send(data);
      }
    }
  }
}

export const wsChannel = new WsChannel();
