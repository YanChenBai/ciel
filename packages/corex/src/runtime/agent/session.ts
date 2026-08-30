import {
  buildSessionContext,
  JsonlSessionRepo,
  SessionError,
  type AgentMessage,
  type Session,
} from '@earendil-works/pi-agent-core';
import { NodeExecutionEnv } from '@earendil-works/pi-agent-core/node';

import type {
  AgentSessionAddress,
  AgentSessionStore,
  CreateAgentSessionStoreOptions,
} from './types.ts';

function createAgentSessionKey(address: AgentSessionAddress): string {
  const encoded = Buffer.from(JSON.stringify([address.cielId, address.sessionId])).toString(
    'base64url',
  );
  return `ciel.${encoded}.session`;
}

export function createAgentSessionStore(
  options: CreateAgentSessionStoreOptions = {},
): AgentSessionStore {
  const cwd = options.cwd ?? process.cwd();
  const environment = new NodeExecutionEnv({ cwd });
  const repository = new JsonlSessionRepo({
    fs: environment,
    sessionsRoot: options.path ?? '.ciel',
  });
  const sessions = new Map<string, Promise<Session>>();

  async function findSession(sessionKey: string): Promise<Session | undefined> {
    const metadata = (await repository.list({ cwd })).find(current => current.id === sessionKey);
    return metadata ? repository.open(metadata) : undefined;
  }

  async function openSession(address: AgentSessionAddress): Promise<Session> {
    const sessionKey = createAgentSessionKey(address);
    const existing = await findSession(sessionKey);
    if (existing) return existing;

    try {
      return await repository.create({
        id: sessionKey,
        cwd,
        metadata: { cielId: address.cielId, sessionId: address.sessionId },
      });
    } catch (error) {
      if (!(error instanceof SessionError) || error.code !== 'already_exists') throw error;
      const created = await findSession(sessionKey);
      if (!created) throw error;
      return created;
    }
  }

  function getSession(address: AgentSessionAddress): Promise<Session> {
    const sessionKey = createAgentSessionKey(address);
    let session = sessions.get(sessionKey);
    if (!session) {
      session = openSession(address);
      sessions.set(sessionKey, session);
    }
    return session;
  }

  async function load(address: AgentSessionAddress) {
    const session = await getSession(address);
    const entries = await session.findEntriesOnBranch({ order: 'oldestFirst' });
    return buildSessionContext(entries).messages;
  }

  async function append(address: AgentSessionAddress, messages: readonly AgentMessage[]) {
    const session = await getSession(address);
    for (const message of messages) {
      await session.appendMessage(message);
    }
  }

  return { append, load };
}

export { createAgentSessionKey };
