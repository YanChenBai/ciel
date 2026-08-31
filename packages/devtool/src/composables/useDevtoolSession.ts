import {
  DevtoolRequestName,
  type DevtoolEvent,
  type DevtoolSnapshot,
  type DevtoolWelcome,
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
  const error = shallowRef<unknown>();
  let startPromise: Promise<void> | undefined;

  function appendEvent(event: DevtoolEvent): boolean {
    if (events.value.some(current => current.id === event.id)) return false;
    const next = [...events.value, event];
    events.value = next.length > eventLimit ? next.slice(-eventLimit) : next;
    return true;
  }

  function projectEvent(event: DevtoolEvent, store = true): void {
    if (store && !appendEvent(event)) return;
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
    error: readonly(error),
    start,
  };
}
