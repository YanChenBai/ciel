import {
  DevtoolRequestName,
  type AgentMessageRecord,
  type DevtoolEvent,
  type DevtoolSnapshot,
  type DevtoolWelcome,
  type EngramEntryRecord,
  type OperationRecord,
  type StreamCursor,
} from '@ciels/devtool-protocol';
import { onScopeDispose, readonly, ref, shallowRef } from 'vue';

import type { DevtoolClient, DevtoolClientStatus } from '@/client/types.ts';
import { reduceDevtoolSnapshot } from '@/session/snapshot.ts';

export interface UseDevtoolSessionOptions {
  readonly eventLimit?: number;
}

export function useDevtoolSession(client: DevtoolClient, options: UseDevtoolSessionOptions = {}) {
  const eventLimit = Math.max(1, options.eventLimit ?? 2_000);
  const status = shallowRef<DevtoolClientStatus>(client.status);
  const welcome = shallowRef<DevtoolWelcome>();
  const cursor = shallowRef<StreamCursor>();
  const snapshot = shallowRef<DevtoolSnapshot>();
  const events = ref<readonly DevtoolEvent[]>([]);
  const operations = ref<readonly OperationRecord[]>([]);
  const engramEntries = ref<readonly EngramEntryRecord[]>([]);
  const messages = ref<readonly AgentMessageRecord[]>([]);
  const error = shallowRef<unknown>();
  let startPromise: Promise<void> | undefined;
  let bootstrapping = true;

  function appendEvent(event: DevtoolEvent): boolean {
    if (events.value.some(current => current.id === event.id)) return false;
    const next = [...events.value, event];
    events.value = next.length > eventLimit ? next.slice(-eventLimit) : next;
    return true;
  }

  function projectEvent(event: DevtoolEvent, store = true): void {
    if (store && !appendEvent(event)) return;
    if (bootstrapping) return;
    const currentCursor = cursor.value;
    const currentSnapshot = snapshot.value;
    if (!currentCursor || !currentSnapshot) return;
    if (
      event.cursor.targetId !== currentCursor.targetId ||
      event.cursor.epoch !== currentCursor.epoch ||
      event.cursor.sequence <= currentCursor.sequence
    ) {
      return;
    }
    cursor.value = event.cursor;
    snapshot.value = reduceDevtoolSnapshot(currentSnapshot, event);
    projectRecords(event);
  }

  function projectRecords(event: DevtoolEvent): void {
    if (
      event.name === 'operation.started' ||
      event.name === 'operation.completed' ||
      event.name === 'operation.failed'
    ) {
      const operation = event.payload.operation;
      operations.value = [
        ...operations.value.filter(current => current.id !== operation.id),
        operation,
      ].sort((left, right) => left.startedAt - right.startedAt);
      return;
    }
    if (event.name === 'engram.appended') {
      const known = new Set(engramEntries.value.map(entry => entry.sequence));
      engramEntries.value = [
        ...engramEntries.value,
        ...event.payload.entries.filter(entry => !known.has(entry.sequence)),
      ].sort((left, right) => left.sequence - right.sequence);
      return;
    }
    if (event.name === 'engram.cleared') {
      engramEntries.value = [];
      return;
    }
    if (event.name === 'agent.message.appended') {
      const known = new Set(messages.value.map(message => message.id));
      messages.value = [
        ...messages.value,
        ...event.payload.messages.filter(message => !known.has(message.id)),
      ].sort((left, right) => left.sequence - right.sequence);
      return;
    }
    if (event.name === 'agent.messages.reset') messages.value = [];
  }

  const disposeNotifications = client.subscribe(notification => {
    if (notification.type === 'status.changed') {
      status.value = notification.status;
      return;
    }
    if (notification.type === 'welcome.received') {
      welcome.value = notification.welcome;
      return;
    }
    projectEvent(notification.event);
  });

  async function start(): Promise<void> {
    if (startPromise) return startPromise;
    startPromise = (async () => {
      error.value = undefined;
      try {
        welcome.value = await client.connect();
        const bootstrap = await client.request(DevtoolRequestName.TargetBootstrap, {});
        cursor.value = bootstrap.cursor;
        snapshot.value = bootstrap.snapshot;
        const requests = new Set(welcome.value.capabilities.requests);
        await Promise.all([
          requests.has(DevtoolRequestName.OperationQuery)
            ? client
                .request(DevtoolRequestName.OperationQuery, { limit: 100 })
                .then(page => (operations.value = page.items))
            : Promise.resolve(),
          requests.has(DevtoolRequestName.EngramQuery)
            ? client
                .request(DevtoolRequestName.EngramQuery, { limit: 100 })
                .then(page => (engramEntries.value = page.items))
            : Promise.resolve(),
          requests.has(DevtoolRequestName.AgentMessageQuery)
            ? client
                .request(DevtoolRequestName.AgentMessageQuery, { limit: 100 })
                .then(page => (messages.value = page.items))
            : Promise.resolve(),
        ]);
        bootstrapping = false;
        for (const event of [...events.value].sort(
          (left, right) => left.cursor.sequence - right.cursor.sequence,
        )) {
          projectEvent(event, false);
        }
      } catch (reason) {
        error.value = reason;
        throw reason;
      }
    })();
    return startPromise;
  }

  onScopeDispose(() => {
    void Promise.resolve(disposeNotifications());
  });

  return {
    status: readonly(status),
    welcome: readonly(welcome),
    cursor: readonly(cursor),
    snapshot: readonly(snapshot),
    events: readonly(events),
    operations: readonly(operations),
    engramEntries: readonly(engramEntries),
    messages: readonly(messages),
    error: readonly(error),
    start,
  };
}
