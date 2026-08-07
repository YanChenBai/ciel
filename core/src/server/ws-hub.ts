import type { ElysiaWS } from 'elysia/ws';

export class WsHub {
  private clients = new Set<ElysiaWS>();

  add(ws: ElysiaWS) {
    this.clients.add(ws);
  }

  remove(ws: ElysiaWS) {
    this.clients.delete(ws);
  }

  broadcast(data: unknown) {
    for (const ws of this.clients) {
      if (ws.readyState === 1) {
        ws.send(data);
      }
    }
  }
}

export const wsHub = new WsHub();
