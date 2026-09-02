import {
  DevtoolEventName,
  DevtoolProtocol,
  DevtoolProtocolErrorCode,
  DevtoolRequestName,
  type DevtoolConsumerMessage,
  type DevtoolProviderMessage,
  type DevtoolSnapshot,
} from '@ciels/devtool-protocol';
import { describe, expect, it } from 'vite-plus/test';

import {
  createDevtoolBridge,
  type DevtoolPeer,
  type DevtoolTargetEventSubscriber,
} from '../src/index.ts';

const snapshot: DevtoolSnapshot = {
  runtime: { status: 'running', observedAt: 100 },
  telemetry: {
    throughSequence: 2,
    operations: 1,
    activeOperations: 0,
    failedOperations: 0,
  },
  engram: { size: 3, throughSequence: 3 },
  agent: { messages: 4, throughSequence: 4 },
  activeOperations: [],
};

function hello(id = 'hello-1'): DevtoolConsumerMessage {
  return {
    protocol: DevtoolProtocol.Name,
    version: DevtoolProtocol.Version,
    id,
    type: 'hello',
    client: { name: 'test-client' },
    supportedVersions: [DevtoolProtocol.Version],
  };
}

function createPeer() {
  const sent: DevtoolProviderMessage[] = [];
  let receive: ((message: DevtoolConsumerMessage) => void | PromiseLike<void>) | undefined;
  let closed = false;
  const peer: DevtoolPeer = {
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
    peer,
    sent,
    get closed() {
      return closed;
    },
    async push(message: DevtoolConsumerMessage) {
      if (!receive) throw new Error('Peer is not attached');
      await receive(message);
    },
  };
}

function createIdFactory() {
  let next = 0;
  return () => `bridge-${++next}`;
}

describe('createDevtoolBridge', () => {
  it('通过 Hello 声明由 Target 能力派生的协议能力', async () => {
    const bridge = createDevtoolBridge({
      epoch: 'epoch-1',
      createId: createIdFactory(),
      target: {
        descriptor: { id: 'target-1', name: 'Ciel' },
        snapshot: () => snapshot,
        requests: {
          'operation.query': () => ({ items: [], throughSequence: 2 }),
        },
      },
    });
    const connection = createPeer();
    bridge.attach(connection.peer);

    await connection.push(hello());

    expect(connection.sent).toEqual([
      expect.objectContaining({
        type: 'welcome',
        epoch: 'epoch-1',
        target: { id: 'target-1', name: 'Ciel' },
        capabilities: {
          requests: [DevtoolRequestName.TargetBootstrap, DevtoolRequestName.OperationQuery],
          events: [],
          features: { resume: false, assets: false, runtimeControl: false },
        },
      }),
    ]);
  });

  it('由 Bridge 处理 bootstrap，并把其余请求交给 Target', async () => {
    const bridge = createDevtoolBridge({
      epoch: 'epoch-1',
      createId: createIdFactory(),
      target: {
        descriptor: { id: 'target-1', name: 'Ciel' },
        snapshot: () => snapshot,
        requests: {
          'operation.query': input => ({
            items: [],
            throughSequence: input.after ?? 2,
          }),
        },
      },
    });
    const connection = createPeer();
    bridge.attach(connection.peer);
    await connection.push(hello());

    await connection.push({
      protocol: DevtoolProtocol.Name,
      version: DevtoolProtocol.Version,
      id: 'request-bootstrap',
      type: 'request',
      name: DevtoolRequestName.TargetBootstrap,
      payload: {},
    });
    await connection.push({
      protocol: DevtoolProtocol.Name,
      version: DevtoolProtocol.Version,
      id: 'request-query',
      type: 'request',
      name: DevtoolRequestName.OperationQuery,
      payload: { after: 7 },
    });

    expect(connection.sent[1]).toMatchObject({
      type: 'response',
      requestId: 'request-bootstrap',
      name: DevtoolRequestName.TargetBootstrap,
      result: {
        ok: true,
        value: {
          cursor: { targetId: 'target-1', epoch: 'epoch-1', sequence: 0 },
          snapshot,
        },
      },
    });
    expect(connection.sent[2]).toMatchObject({
      type: 'response',
      requestId: 'request-query',
      name: DevtoolRequestName.OperationQuery,
      result: { ok: true, value: { items: [], throughSequence: 7 } },
    });
  });

  it('只向完成握手的 Peer 广播带游标事件', async () => {
    let publish: DevtoolTargetEventSubscriber | undefined;
    const bridge = createDevtoolBridge({
      epoch: 'epoch-1',
      createId: createIdFactory(),
      target: {
        descriptor: { id: 'target-1', name: 'Ciel' },
        snapshot: () => snapshot,
        events: [DevtoolEventName.RuntimeStatusChanged],
        subscribe(subscriber) {
          publish = subscriber;
          return () => {
            publish = undefined;
          };
        },
      },
    });
    const ready = createPeer();
    const pending = createPeer();
    bridge.attach(ready.peer);
    bridge.attach(pending.peer);
    await ready.push(hello());

    await publish?.({
      name: DevtoolEventName.RuntimeStatusChanged,
      time: 120,
      payload: { previous: 'idle', status: 'running' },
    });

    expect(ready.sent[1]).toMatchObject({
      type: 'event',
      name: DevtoolEventName.RuntimeStatusChanged,
      cursor: { targetId: 'target-1', epoch: 'epoch-1', sequence: 1 },
    });
    expect(pending.sent).toEqual([]);
  });

  it('在握手前拒绝请求，并在关闭时释放连接', async () => {
    const bridge = createDevtoolBridge({
      epoch: 'epoch-1',
      createId: createIdFactory(),
      target: {
        descriptor: { id: 'target-1', name: 'Ciel' },
        snapshot: () => snapshot,
      },
    });
    const connection = createPeer();
    bridge.attach(connection.peer);

    await connection.push({
      protocol: DevtoolProtocol.Name,
      version: DevtoolProtocol.Version,
      id: 'request-1',
      type: 'request',
      name: DevtoolRequestName.TargetBootstrap,
      payload: {},
    });

    expect(connection.sent[0]).toMatchObject({
      type: 'response',
      result: {
        ok: false,
        error: { code: DevtoolProtocolErrorCode.InvalidRequest },
      },
    });
    await bridge.close();
    expect(connection.closed).toBe(true);
    await expect(connection.push(hello())).rejects.toThrow('Peer is not attached');
  });
});
