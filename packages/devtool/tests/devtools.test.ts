import { DevtoolProtocol, type DevtoolConsumerMessage } from '@ciels/devtool-protocol';
import type { Ciel } from 'corex';
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
  } as unknown as Ciel;
}

describe('devtools', () => {
  it('作为 Plugin 接管适配器连接和协议握手', async () => {
    const connection = createAdapter();
    const extension = devtools({ adapter: connection.adapter, name: 'Ciel Test' });
    const instance = extension.create({} as never);

    expect(extension.kind).toBe('plugin');
    expect(extension.interceptors).toHaveLength(1);

    await instance.activate?.({ ciel: createCiel(), emitSignal: async () => undefined });
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

    await instance.deactivate?.();
    expect(connection.closed).toBe(true);
    await expect(connection.push({} as DevtoolConsumerMessage)).rejects.toThrow(
      'Adapter is not active',
    );
  });
});
