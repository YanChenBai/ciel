import type { ElysiaWS } from 'elysia/ws';

import type { BridgeMessage } from '#protocol';

export class WsChannel {
  private clients = new Set<ElysiaWS>();
  private bootstrap?: () => BridgeMessage;

  add(ws: ElysiaWS) {
    this.clients.add(ws);
    const message = this.bootstrap?.();
    if (message) ws.send(message);
  }

  remove(ws: ElysiaWS) {
    this.clients.delete(ws);
  }

  emit(data: BridgeMessage) {
    for (const ws of this.clients) {
      try {
        ws.send(data);
      } catch {
        this.clients.delete(ws);
      }
    }
  }

  setBootstrap(bootstrap?: () => BridgeMessage): void {
    this.bootstrap = bootstrap;
  }
}
