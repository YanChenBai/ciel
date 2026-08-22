import type { Ciel } from '@ciels/core';
import { node } from '@elysia/node';
import { Elysia, t } from 'elysia';

import { WsChannel } from './ws-channel.ts';

function createApp(wsChannel: WsChannel) {
  return new Elysia({ adapter: node() }).ws('/ws', {
    open(ws) {
      wsChannel.add(ws);
    },
    close(ws) {
      wsChannel.remove(ws);
    },
    // Node adapter 无法在运行时编译 TypeBox Unsafe；WsChannel 与客户端协议仍由
    // BridgeMessage 提供静态类型约束。
    response: t.Any(),
  });
}

export type App = ReturnType<typeof createApp>;
type BridgeCiel = Pick<Ciel<unknown>, 'vigilia'>;

interface BridgeServer {
  stop(): unknown;
}

export class CielBridge {
  readonly app: App;
  private readonly unsubscribe: () => void;
  private readonly wsChannel = new WsChannel();
  private server?: BridgeServer;
  private stopped = false;

  constructor(ciel: BridgeCiel) {
    this.wsChannel.setBootstrap(() => ({
      events: ciel.vigilia.events({ limit: Number.MAX_SAFE_INTEGER }),
      snapshot: ciel.vigilia.snapshot(),
      type: 'vigilia.bootstrap',
    }));
    this.unsubscribe = ciel.vigilia.subscribe((event, snapshot) => {
      this.wsChannel.emit({ event, snapshot, type: 'vigilia.event' });
    });
    this.app = createApp(this.wsChannel);
  }

  listen(options: Parameters<App['listen']>[0]): this {
    if (this.server) throw new Error('CielBridge is already listening');
    if (this.stopped) throw new Error('CielBridge has already stopped');
    this.app.listen(options, server => {
      this.server = server;
    });
    return this;
  }

  async stop(): Promise<void> {
    if (this.stopped) return;
    this.stopped = true;
    this.unsubscribe();
    this.wsChannel.setBootstrap();
    await this.server?.stop();
    this.server = undefined;
  }
}

/** 为单个 Ciel 运行时创建独立的 Node WebSocket Bridge。 */
export function createBridge<TOutput>(ciel: Ciel<TOutput>): CielBridge {
  return new CielBridge(ciel);
}
