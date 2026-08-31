import { computed, onBeforeUnmount, onMounted, shallowRef } from 'vue';

import type {
  AppState,
  DanmakuDelivery,
  LiveArea,
  StartOptions,
  WatchMode,
} from '../../../shared/types.ts';

export function useAppState() {
  const state = shallowRef<AppState>();
  const areas = shallowRef<readonly LiveArea[]>([]);
  const mode = shallowRef<WatchMode>('standard');
  const delivery = shallowRef<DanmakuDelivery>('simulate');
  const roomId = shallowRef('');
  const areaId = shallowRef('9');
  const pending = shallowRef(false);
  const error = shallowRef('');
  let unsubscribe: (() => void) | undefined;

  onMounted(async () => {
    try {
      state.value = await window.watchBlive.state.get();
      areas.value = await window.watchBlive.areas.list();
      unsubscribe = window.watchBlive.state.subscribe(value => {
        state.value = value;
      });
    } catch (reason) {
      error.value = message(reason);
    }
  });
  onBeforeUnmount(() => unsubscribe?.());

  const title = computed(() =>
    state.value?.room
      ? `${state.value.room.streamerName} · ${state.value.room.roomId}`
      : 'Watch Blive',
  );
  const canStart = computed(
    () => Number(mode.value === 'standard' ? roomId.value : areaId.value) > 0,
  );

  async function run(action: () => Promise<void>): Promise<void> {
    pending.value = true;
    error.value = '';
    try {
      await action();
    } catch (reason) {
      error.value = message(reason);
    } finally {
      pending.value = false;
    }
  }

  function start(): Promise<void> {
    const options: StartOptions =
      mode.value === 'standard'
        ? { mode: 'standard', roomId: Number(roomId.value), danmakuDelivery: delivery.value }
        : { mode: 'autonomous', areaId: Number(areaId.value), danmakuDelivery: delivery.value };
    return run(() => window.watchBlive.runtime.start(options));
  }

  return {
    areaId,
    areas,
    canStart,
    delivery,
    error,
    mode,
    pending,
    roomId,
    start,
    state,
    title,
    stop: () => run(() => window.watchBlive.runtime.stop()),
    login: () => run(() => window.watchBlive.account.login()),
    logout: () => run(() => window.watchBlive.account.logout()),
  };
}

function message(error: unknown): string {
  return (error instanceof Error ? error.message : String(error)).replace(
    /^Error invoking remote method '[^']+': (?:TypeError|Error): /,
    '',
  );
}
