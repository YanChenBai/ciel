import {
  DevtoolProtocol,
  DevtoolProtocolErrorCode,
  DevtoolRequestName,
  type DevtoolCapabilities,
  type DevtoolEvent,
  type DevtoolHello,
  type DevtoolProtocolError,
  type DevtoolProviderMessage,
  type DevtoolRequest,
  type DevtoolResponse,
  type DevtoolWelcome,
} from '@ciels/devtool-protocol';

import type {
  CreateDevtoolBridgeOptions,
  DevtoolBridge,
  DevtoolPeer,
  DevtoolTargetEvent,
  DevtoolTargetRequestHandlers,
} from './types.ts';

interface BridgeSession {
  readonly peer: DevtoolPeer;
  disposeInbound: () => void | PromiseLike<void>;
  ready: boolean;
  disposed: boolean;
}

type InternalRequestHandler = (input: never) => unknown;

function protocolError(
  code: DevtoolProtocolError['code'],
  message: string,
  retryable = false,
): DevtoolProtocolError {
  return { code, message, retryable };
}

function captureError(error: unknown): DevtoolProtocolError {
  return protocolError(
    DevtoolProtocolErrorCode.Internal,
    error instanceof Error ? error.message : 'Devtool target request failed',
  );
}

function targetRequestNames(
  handlers: Partial<DevtoolTargetRequestHandlers> | undefined,
): readonly Exclude<keyof DevtoolTargetRequestHandlers, number | symbol>[] {
  return Object.keys(handlers ?? {}) as Exclude<
    keyof DevtoolTargetRequestHandlers,
    number | symbol
  >[];
}

export function createDevtoolBridge(options: CreateDevtoolBridgeOptions): DevtoolBridge {
  const { createId, epoch, target } = options;
  const sessions = new Set<BridgeSession>();
  const supportedRequests = targetRequestNames(target.requests);
  const supportedEvents = target.events ?? [];
  const capabilities: DevtoolCapabilities = {
    requests: [DevtoolRequestName.TargetBootstrap, ...supportedRequests],
    events: supportedEvents,
    features: {
      resume: false,
      assets: false,
      runtimeControl:
        supportedRequests.includes(DevtoolRequestName.RuntimeStart) ||
        supportedRequests.includes(DevtoolRequestName.RuntimeStop),
    },
  };
  let sequence = 0;
  let closed = false;

  async function send(session: BridgeSession, message: DevtoolProviderMessage): Promise<void> {
    if (session.disposed) return;
    try {
      await session.peer.send(message);
    } catch {
      await detach(session);
    }
  }

  function welcome(): DevtoolWelcome {
    return {
      protocol: DevtoolProtocol.Name,
      version: DevtoolProtocol.Version,
      id: createId(),
      type: 'welcome',
      epoch,
      target: target.descriptor,
      capabilities,
    };
  }

  function response(request: DevtoolRequest, result: DevtoolResponse['result']): DevtoolResponse {
    return {
      protocol: DevtoolProtocol.Name,
      version: DevtoolProtocol.Version,
      id: createId(),
      type: 'response',
      requestId: request.id,
      name: request.name,
      result,
    } as DevtoolResponse;
  }

  async function bootstrap(request: DevtoolRequest): Promise<DevtoolResponse> {
    return response(request, {
      ok: true,
      value: {
        cursor: {
          targetId: target.descriptor.id,
          epoch,
          sequence,
        },
        snapshot: await target.snapshot(),
      },
    });
  }

  async function dispatch(request: DevtoolRequest): Promise<DevtoolResponse> {
    if (request.name === DevtoolRequestName.TargetBootstrap) {
      return bootstrap(request);
    }

    const handlers = target.requests as
      | Readonly<Record<string, InternalRequestHandler | undefined>>
      | undefined;
    const handler = handlers?.[request.name];
    if (!handler) {
      return response(request, {
        ok: false,
        error: protocolError(
          DevtoolProtocolErrorCode.Unsupported,
          `Devtool request "${request.name}" is not supported by this target`,
        ),
      });
    }

    try {
      const value = await handler(request.payload as never);
      return response(request, { ok: true, value } as DevtoolResponse['result']);
    } catch (error) {
      return response(request, { ok: false, error: captureError(error) });
    }
  }

  async function receive(session: BridgeSession, message: DevtoolHello | DevtoolRequest) {
    if (session.disposed || closed) return;

    if (message.type === 'hello') {
      if (!message.supportedVersions.includes(DevtoolProtocol.Version)) {
        await detach(session);
        await session.peer.close?.();
        return;
      }
      session.ready = true;
      await send(session, welcome());
      return;
    }

    if (!session.ready) {
      await send(
        session,
        response(message, {
          ok: false,
          error: protocolError(
            DevtoolProtocolErrorCode.InvalidRequest,
            'Devtool hello must be completed before sending requests',
          ),
        }),
      );
      return;
    }

    await send(session, await dispatch(message));
  }

  async function publish(event: DevtoolTargetEvent): Promise<void> {
    if (closed) return;
    const message = {
      protocol: DevtoolProtocol.Name,
      version: DevtoolProtocol.Version,
      id: createId(),
      type: 'event',
      cursor: {
        targetId: target.descriptor.id,
        epoch,
        sequence: ++sequence,
      },
      time: event.time,
      name: event.name,
      payload: event.payload,
    } as DevtoolEvent;
    await Promise.all(
      Array.from(sessions, session => (session.ready ? send(session, message) : Promise.resolve())),
    );
  }

  const disposeTarget = target.subscribe?.(publish);

  async function detach(session: BridgeSession): Promise<void> {
    if (session.disposed) return;
    session.disposed = true;
    sessions.delete(session);
    await session.disposeInbound();
  }

  function attach(peer: DevtoolPeer) {
    if (closed) throw new Error('Devtool bridge is closed');
    const session: BridgeSession = {
      peer,
      disposeInbound: () => undefined,
      ready: false,
      disposed: false,
    };
    sessions.add(session);
    session.disposeInbound = peer.subscribe(message => receive(session, message));
    return () => detach(session);
  }

  async function close(): Promise<void> {
    if (closed) return;
    closed = true;
    await disposeTarget?.();
    const activeSessions = [...sessions];
    await Promise.all(activeSessions.map(detach));
    await Promise.all(activeSessions.map(session => Promise.resolve(session.peer.close?.())));
  }

  return {
    target: target.descriptor,
    attach,
    close,
  };
}
