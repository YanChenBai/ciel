import {
  DevtoolProtocol,
  type DevtoolEvent,
  type DevtoolProviderMessage,
  type DevtoolRequestInput,
  type DevtoolRequestName,
  type DevtoolRequestOutput,
  type DevtoolResponse,
  type DevtoolWelcome,
} from '@ciels/devtool-protocol';

import { DevtoolRequestError } from './error.ts';
import type {
  CreateDevtoolClientOptions,
  DevtoolClient,
  DevtoolClientNotification,
  DevtoolClientStatus,
  Dispose,
} from './types.ts';

interface PendingRequest {
  reject(reason: unknown): void;
  resolve(value: unknown): void;
}

function closedError(): Error {
  return new Error('Devtool client is closed');
}

export function createDevtoolClient(options: CreateDevtoolClientOptions): DevtoolClient {
  const { client, connection, createId } = options;
  const listeners = new Set<(notification: DevtoolClientNotification) => void>();
  const pendingRequests = new Map<string, PendingRequest>();
  let status: DevtoolClientStatus = 'idle';
  let welcome: DevtoolWelcome | undefined;
  let connectPromise: Promise<DevtoolWelcome> | undefined;
  let resolveWelcome: ((welcome: DevtoolWelcome) => void) | undefined;
  let rejectWelcome: ((reason: unknown) => void) | undefined;
  let disposeConnection: Dispose | undefined;

  function notify(notification: DevtoolClientNotification): void {
    for (const listener of listeners) listener(notification);
  }

  function setStatus(next: DevtoolClientStatus): void {
    if (status === next) return;
    status = next;
    notify({ type: 'status.changed', status });
  }

  function isClosed(): boolean {
    return status === 'closed';
  }

  async function unsubscribeConnection(): Promise<void> {
    const dispose = disposeConnection;
    disposeConnection = undefined;
    await dispose?.();
  }

  function receiveWelcome(message: DevtoolWelcome): void {
    if (status !== 'connecting') return;
    welcome = message;
    setStatus('connected');
    notify({ type: 'welcome.received', welcome: message });
    resolveWelcome?.(message);
    resolveWelcome = undefined;
    rejectWelcome = undefined;
  }

  function receiveResponse(message: DevtoolResponse): void {
    const pending = pendingRequests.get(message.requestId);
    if (!pending) return;
    pendingRequests.delete(message.requestId);
    if (message.result.ok) pending.resolve(message.result.value);
    else pending.reject(new DevtoolRequestError(message.result.error));
  }

  function receiveEvent(message: DevtoolEvent): void {
    if (status !== 'connected') return;
    notify({ type: 'event.received', event: message });
  }

  function receive(message: DevtoolProviderMessage): void {
    if (message.type === 'welcome') receiveWelcome(message);
    else if (message.type === 'response') receiveResponse(message);
    else receiveEvent(message);
  }

  async function connect(): Promise<DevtoolWelcome> {
    if (status === 'closed') throw closedError();
    if (welcome) return welcome;
    if (connectPromise) return connectPromise;

    setStatus('connecting');
    disposeConnection = connection.subscribe(receive);
    const received = new Promise<DevtoolWelcome>((resolve, reject) => {
      resolveWelcome = resolve;
      rejectWelcome = reject;
    });
    connectPromise = (async () => {
      await connection.send({
        protocol: DevtoolProtocol.Name,
        version: DevtoolProtocol.Version,
        id: createId(),
        type: 'hello',
        client,
        supportedVersions: [DevtoolProtocol.Version],
      });
      return received;
    })();

    try {
      return await connectPromise;
    } catch (error) {
      if (!isClosed()) setStatus('idle');
      resolveWelcome = undefined;
      rejectWelcome = undefined;
      connectPromise = undefined;
      await unsubscribeConnection();
      throw error;
    }
  }

  async function request<TName extends DevtoolRequestName>(
    name: TName,
    payload: DevtoolRequestInput<TName>,
  ): Promise<DevtoolRequestOutput<TName>> {
    if (status !== 'connected') throw new Error('Devtool client is not connected');
    const id = createId();
    const result = new Promise<DevtoolRequestOutput<TName>>((resolve, reject) => {
      pendingRequests.set(id, { resolve, reject });
    });
    try {
      await connection.send({
        protocol: DevtoolProtocol.Name,
        version: DevtoolProtocol.Version,
        id,
        type: 'request',
        name,
        payload,
      } as Parameters<typeof connection.send>[0]);
    } catch (error) {
      pendingRequests.delete(id);
      throw error;
    }
    return result;
  }

  function subscribe(listener: (notification: DevtoolClientNotification) => void): Dispose {
    if (status === 'closed') throw closedError();
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  }

  async function close(): Promise<void> {
    if (status === 'closed') return;
    setStatus('closed');
    const error = closedError();
    rejectWelcome?.(error);
    resolveWelcome = undefined;
    rejectWelcome = undefined;
    for (const pending of pendingRequests.values()) pending.reject(error);
    pendingRequests.clear();
    await unsubscribeConnection();
    listeners.clear();
  }

  return {
    get status() {
      return status;
    },
    get target() {
      return welcome?.target;
    },
    get capabilities() {
      return welcome?.capabilities;
    },
    connect,
    request,
    subscribe,
    close,
  };
}
