import type { Ciel } from '@cieljs/core';
import { DevtoolProtocol, type DevtoolConsumerMessage } from '@ciels/devtool-protocol';
import { describe, expect, it } from 'vite-plus/test';

import { devtools, type DevtoolsAdapter } from '../src/index.ts';

function createAdapter() {
  const sent: unknown[] = [];
  let receive: ((message: DevtoolConsumerMessage) => void | PromiseLike<void>) | undefined;
  let closed = false;
  const adapter: DevtoolsAdapter = {
    send(message) {
      sent.push(message);
    },
    subscribe(listener) {
      receive = listener;
      return () => {
        receive = undefined;
      };
    },
    close() {
      closed = true;
    },
  };

  return {
    adapter,
    sent,
    get closed() {
      return closed;
    },
    async push(message: DevtoolConsumerMessage) {
      if (!receive) throw new Error('Adapter is not active');
      await receive(message);
    },
  };
}

function createCiel(): Ciel {
  return {
    id: 'ciel-test',
    sessionId: 'session-test',
    status: 'running',
    messages: [],
    engram: {
      all: () => [],
      clear: () => undefined,
    },
    think: async () => [],
    start: async () => undefined,
    stop: async () => undefined,
    dispatchSignal: async () => undefined,
  } as unknown as Ciel;
}

describe('devtools', () => {
  it('作为 Plugin 接管适配器连接和协议握手', async () => {
    const connection = createAdapter();
    const plugin = devtools({ adapter: connection.adapter, name: 'Ciel Test' });

    expect(plugin.interceptors).toHaveLength(1);

    await plugin.activate?.({ ciel: createCiel() });
    await connection.push({
      protocol: DevtoolProtocol.Name,
      version: DevtoolProtocol.Version,
      id: 'hello-1',
      type: 'hello',
      client: { name: 'test-client' },
      supportedVersions: [DevtoolProtocol.Version],
    });

    expect(connection.sent).toEqual([
      expect.objectContaining({
        type: 'welcome',
        target: { id: 'ciel-test', name: 'Ciel Test' },
      }),
    ]);

    await plugin.deactivate?.();
    expect(connection.closed).toBe(true);
    await expect(connection.push({} as DevtoolConsumerMessage)).rejects.toThrow(
      'Adapter is not active',
    );
  });
});
