import {
  DevtoolEventName,
  DevtoolProtocol,
  DevtoolRequestName,
  type DevtoolConsumerMessage,
  type DevtoolProviderMessage,
  type DevtoolSnapshot,
} from '@ciels/devtool-protocol';
import { describe, expect, it } from 'vite-plus/test';
import { effectScope } from 'vue';

import { createDevtoolClient, type DevtoolConnection } from '../src/client/index.ts';
import { useDevtoolSession } from '../src/composables/useDevtoolSession.ts';

const snapshot: DevtoolSnapshot = {
  runtime: { status: 'idle', observedAt: 10 },
  telemetry: {
    throughSequence: 0,
    operations: 0,
    activeOperations: 0,
    failedOperations: 0,
  },
  engram: { size: 0, throughSequence: 0 },
  agent: { messages: 0, throughSequence: 0 },
  activeOperations: [],
};

describe('useDevtoolSession', () => {
  it('在 bootstrap 完成后重放游标之后到达的事件', async () => {
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
    let nextId = 0;
    const client = createDevtoolClient({
      connection,
      createId: () => `client-${++nextId}`,
      client: { name: 'devtool' },
    });
    const scope = effectScope();
    const session = scope.run(() => useDevtoolSession(client));
    if (!session) throw new Error('Session scope did not start');

    const starting = session.start();
    if (!receive) throw new Error('Session did not subscribe to the connection');
    await receive({
      protocol: DevtoolProtocol.Name,
      version: DevtoolProtocol.Version,
      id: 'welcome-1',
      type: 'welcome',
      epoch: 'epoch-1',
      target: { id: 'target-1', name: 'Ciel' },
      capabilities: {
        requests: [DevtoolRequestName.TargetBootstrap],
        events: [DevtoolEventName.RuntimeStatusChanged],
        features: { resume: false, assets: false, runtimeControl: false },
      },
    });
    await expect
      .poll(() => sent[1])
      .toMatchObject({
        type: 'request',
        name: DevtoolRequestName.TargetBootstrap,
      });

    await receive({
      protocol: DevtoolProtocol.Name,
      version: DevtoolProtocol.Version,
      id: 'event-2',
      type: 'event',
      cursor: { targetId: 'target-1', epoch: 'epoch-1', sequence: 2 },
      time: 20,
      name: DevtoolEventName.RuntimeStatusChanged,
      payload: { previous: 'idle', status: 'running' },
    });
    await receive({
      protocol: DevtoolProtocol.Name,
      version: DevtoolProtocol.Version,
      id: 'response-1',
      type: 'response',
      requestId: 'client-2',
      name: DevtoolRequestName.TargetBootstrap,
      result: {
        ok: true,
        value: {
          cursor: { targetId: 'target-1', epoch: 'epoch-1', sequence: 1 },
          snapshot,
        },
      },
    });
    await starting;

    expect(session.cursor.value?.sequence).toBe(2);
    expect(session.snapshot.value?.runtime).toEqual({ status: 'running', observedAt: 20 });
    expect(session.events.value).toHaveLength(1);
    scope.stop();
  });
});
