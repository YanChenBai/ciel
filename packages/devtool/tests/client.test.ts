import {
  DevtoolEventName,
  DevtoolProtocol,
  DevtoolProtocolErrorCode,
  DevtoolRequestName,
  type DevtoolConsumerMessage,
  type DevtoolProviderMessage,
} from '@ciels/devtool-protocol';
import { describe, expect, it } from 'vite-plus/test';

import {
  createDevtoolClient,
  DevtoolRequestError,
  type DevtoolConnection,
} from '../src/client/index.ts';

function createConnection() {
  const sent: DevtoolConsumerMessage[] = [];
  let receive: ((message: DevtoolProviderMessage) => void | PromiseLike<void>) | undefined;
  const connection: DevtoolConnection = {
    send(message) {
      sent.push(message);
    },
    subscribe(listener) {
      receive = listener;
      return () => {
        receive = undefined;
      };
    },
  };
  return {
    connection,
    sent,
    async push(message: DevtoolProviderMessage) {
      if (!receive) throw new Error('Connection is not subscribed');
      await receive(message);
    },
  };
}

function welcome(id = 'welcome-1'): DevtoolProviderMessage {
  return {
    protocol: DevtoolProtocol.Name,
    version: DevtoolProtocol.Version,
    id,
    type: 'welcome',
    epoch: 'epoch-1',
    target: { id: 'target-1', name: 'Ciel' },
    capabilities: {
      requests: [DevtoolRequestName.TargetBootstrap, DevtoolRequestName.OperationQuery],
      events: [DevtoolEventName.RuntimeStatusChanged],
      features: { resume: false, assets: false, runtimeControl: false },
    },
  };
}

function createIdFactory() {
  let next = 0;
  return () => `client-${++next}`;
}

describe('createDevtoolClient', () => {
  it('发送 Hello 并记录 Welcome 提供的 Target 与 Capability', async () => {
    const transport = createConnection();
    const client = createDevtoolClient({
      connection: transport.connection,
      createId: createIdFactory(),
      client: { name: 'devtool' },
    });
    const connecting = client.connect();

    expect(transport.sent).toEqual([
      {
        protocol: DevtoolProtocol.Name,
        version: DevtoolProtocol.Version,
        id: 'client-1',
        type: 'hello',
        client: { name: 'devtool' },
        supportedVersions: [DevtoolProtocol.Version],
      },
    ]);
    await transport.push(welcome());
    await expect(connecting).resolves.toMatchObject({ type: 'welcome', epoch: 'epoch-1' });
    expect(client.status).toBe('connected');
    expect(client.target).toEqual({ id: 'target-1', name: 'Ciel' });
  });

  it('保持请求输入与响应输出的类型化关联', async () => {
    const transport = createConnection();
    const client = createDevtoolClient({
      connection: transport.connection,
      createId: createIdFactory(),
      client: { name: 'devtool' },
    });
    const connecting = client.connect();
    await transport.push(welcome());
    await connecting;

    const querying = client.request(DevtoolRequestName.OperationQuery, { after: 4, limit: 20 });
    expect(transport.sent[1]).toMatchObject({
      type: 'request',
      id: 'client-2',
      name: DevtoolRequestName.OperationQuery,
      payload: { after: 4, limit: 20 },
    });
    await transport.push({
      protocol: DevtoolProtocol.Name,
      version: DevtoolProtocol.Version,
      id: 'response-1',
      type: 'response',
      requestId: 'client-2',
      name: DevtoolRequestName.OperationQuery,
      result: { ok: true, value: { items: [], throughSequence: 4 } },
    });
    await expect(querying).resolves.toEqual({ items: [], throughSequence: 4 });
  });

  it('把协议错误转为带结构化详情的 Client Error', async () => {
    const transport = createConnection();
    const client = createDevtoolClient({
      connection: transport.connection,
      createId: createIdFactory(),
      client: { name: 'devtool' },
    });
    const connecting = client.connect();
    await transport.push(welcome());
    await connecting;

    const querying = client.request(DevtoolRequestName.OperationQuery, {});
    await transport.push({
      protocol: DevtoolProtocol.Name,
      version: DevtoolProtocol.Version,
      id: 'response-1',
      type: 'response',
      requestId: 'client-2',
      name: DevtoolRequestName.OperationQuery,
      result: {
        ok: false,
        error: {
          code: DevtoolProtocolErrorCode.Unsupported,
          message: 'Operation query is unavailable',
          retryable: false,
        },
      },
    });

    const error = await querying.catch(reason => reason);
    expect(error).toBeInstanceOf(DevtoolRequestError);
    expect(error.protocolError.code).toBe(DevtoolProtocolErrorCode.Unsupported);
  });

  it('发布事件通知，并在关闭后拒绝未完成请求', async () => {
    const transport = createConnection();
    const client = createDevtoolClient({
      connection: transport.connection,
      createId: createIdFactory(),
      client: { name: 'devtool' },
    });
    const notifications: string[] = [];
    client.subscribe(notification => notifications.push(notification.type));
    const connecting = client.connect();
    await transport.push(welcome());
    await connecting;
    await transport.push({
      protocol: DevtoolProtocol.Name,
      version: DevtoolProtocol.Version,
      id: 'event-1',
      type: 'event',
      cursor: { targetId: 'target-1', epoch: 'epoch-1', sequence: 1 },
      time: 100,
      name: DevtoolEventName.RuntimeStatusChanged,
      payload: { previous: 'idle', status: 'running' },
    });
    const querying = client.request(DevtoolRequestName.OperationQuery, {});
    await client.close();

    expect(notifications).toEqual([
      'status.changed',
      'status.changed',
      'welcome.received',
      'event.received',
      'status.changed',
    ]);
    await expect(querying).rejects.toThrow('Devtool client is closed');
    expect(client.status).toBe('closed');
  });
});
