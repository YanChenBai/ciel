<script setup lang="ts">
import { CielDevTools } from '@ciels/devtools';
import { LogIn, Play, Radio, Square } from '@lucide/vue';
import { computed, nextTick, onBeforeUnmount, onMounted, ref, shallowRef, watch } from 'vue';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select';
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from '@/components/ui/resizable';

import type { BliveDesktopState, BliveMode } from '../../shared/types.ts';

const state = shallowRef<BliveDesktopState>();
const roomId = ref('6374209');
const mode = ref<BliveMode>('standard');
const areaUrl = ref('');
const pending = ref(false);
const localError = ref('');
const liveHost = ref<HTMLElement>();
let stopEvents: (() => void) | undefined;
let resizeObserver: ResizeObserver | undefined;

const title = computed(() => {
  const room = state.value?.room;
  return room ? `${room.streamerName} · ${room.roomId}` : 'Ciel Blive';
});
const modeLabel = computed(() =>
  (state.value?.mode ?? mode.value) === 'autonomous' ? '自主模式' : '标准模式',
);

onMounted(async () => {
  try {
    if (!window.blive) throw new Error('Electron preload 未加载，请完全退出应用后重新启动');
    state.value = await window.blive.bootstrap();
    stopEvents = window.blive.onEvent(event => {
      if (event.type === 'state') {
        state.value = event.state;
        return;
      }
      if (!state.value) return;
      state.value = {
        ...state.value,
        events: [...state.value.events, event.event],
        snapshot: event.snapshot,
      };
    });
    resizeObserver = new ResizeObserver(() => updateLiveBounds());
    if (liveHost.value) resizeObserver.observe(liveHost.value);
    await nextTick();
    updateLiveBounds();
  } catch (error) {
    localError.value = error instanceof Error ? error.message : String(error);
  }
});

onBeforeUnmount(() => {
  stopEvents?.();
  resizeObserver?.disconnect();
});

watch(title, value => {
  document.title = value;
});

async function run(action: () => Promise<void>): Promise<void> {
  pending.value = true;
  localError.value = '';
  try {
    await action();
  } catch (error) {
    localError.value = formatCommandError(error);
  } finally {
    pending.value = false;
  }
}

function formatCommandError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  return message.replace(/^Error invoking remote method '[^']+': (?:TypeError|Error): /, '');
}

function start(): Promise<void> {
  return run(() =>
    window.blive.command({
      type: 'start',
      options: {
        ...(areaUrl.value.trim() ? { areaUrl: areaUrl.value.trim() } : {}),
        mode: mode.value,
        roomId: Number(roomId.value),
      },
    }),
  );
}

function stop(): Promise<void> {
  return run(() => window.blive.command({ type: 'stop' }));
}

function login(): Promise<void> {
  return run(() => window.blive.command({ type: 'login' }));
}

function updateLiveBounds(): void {
  const rect = liveHost.value?.getBoundingClientRect();
  if (!rect) return;
  window.blive.setLiveBounds({
    height: rect.height,
    width: rect.width,
    x: rect.x,
    y: rect.y,
  });
}
</script>

<template>
  <main class="app-shell">
    <header class="window-bar">
      <div v-if="state?.running" class="room-heading">
        <Radio class="room-heading-icon" />
        <strong>{{ title }}</strong>
        <Badge variant="outline" class="mode-badge" :class="state.mode">{{ modeLabel }}</Badge>
      </div>
      <Button
        v-if="state?.running"
        type="button"
        variant="destructive"
        size="xs"
        class="titlebar-action"
        :disabled="pending"
        @click="stop"
      >
        <Square data-icon="inline-start" />
        停止
      </Button>
      <div class="account">
        <img
          v-if="state?.account?.face"
          :src="state.account.face"
          :alt="state.account.name"
          referrerpolicy="no-referrer"
        />
        <span>{{ state?.account?.name ?? '未登录' }}</span>
        <Button
          v-if="!state?.account"
          type="button"
          variant="outline"
          size="xs"
          class="titlebar-action"
          :disabled="pending"
          @click="login"
        >
          <LogIn data-icon="inline-start" />
          登录账号
        </Button>
      </div>
    </header>

    <p v-if="localError || state?.error" class="error-banner">
      {{ localError || state?.error }}
    </p>

    <section v-if="!state?.running" class="launch-view">
      <form class="launch-form" @submit.prevent="start">
        <div class="launch-header">
          <div class="launch-icon"><Radio /></div>
          <h1>进入直播间</h1>
          <p>选择观看方式，Ciel 会在开始后接收直播内容并独立思考。</p>
        </div>

        <div class="launch-fields">
          <div class="field-group">
            <Label for="room-id">直播间 ID</Label>
            <Input
              id="room-id"
              v-model="roomId"
              class="launch-input"
              inputmode="numeric"
              placeholder="输入直播间 ID"
            />
          </div>
          <div class="field-group">
            <Label for="watch-mode">观看模式</Label>
            <NativeSelect id="watch-mode" v-model="mode" class="launch-select">
              <NativeSelectOption value="standard"
                >标准模式 · 固定观看当前直播间</NativeSelectOption
              >
              <NativeSelectOption value="autonomous"
                >自主模式 · 从分区探索直播间</NativeSelectOption
              >
            </NativeSelect>
            <p class="field-hint">
              {{
                mode === 'autonomous'
                  ? 'Agent 会评估内容质量并决定继续停留或切换。'
                  : '只观看指定直播间，不会自动切换。'
              }}
            </p>
          </div>
          <div v-if="mode === 'autonomous'" class="field-group">
            <Label for="area-url">分区地址</Label>
            <Input
              id="area-url"
              v-model="areaUrl"
              class="launch-input"
              placeholder="https://live.bilibili.com/p/eden/area-tags..."
            />
          </div>
        </div>

        <div class="launch-actions">
          <Button type="submit" size="lg" :disabled="pending || !roomId.trim()">
            <Play data-icon="inline-start" />
            {{ pending ? '正在启动…' : '开始观看' }}
          </Button>
          <span>AI 配置仅在开始后加载</span>
        </div>
      </form>
    </section>

    <ResizablePanelGroup v-show="state?.running" direction="horizontal" class="workspace">
      <ResizablePanel :default-size="56" :min-size="36">
        <div class="live-column">
          <div ref="liveHost" class="live-host" />
        </div>
      </ResizablePanel>

      <ResizableHandle class="workspace-handle" with-handle />

      <ResizablePanel :default-size="44" :min-size="28">
        <div class="devtools-column">
          <CielDevTools
            v-if="state?.running"
            :connected="state.connected"
            :events="state.events"
            :snapshot="state.snapshot"
            :title="title"
          >
            <template #title-extra>
              <Badge variant="outline" class="mode-badge" :class="state.mode">
                {{ modeLabel }}
              </Badge>
            </template>
          </CielDevTools>
        </div>
      </ResizablePanel>
    </ResizablePanelGroup>
  </main>
</template>
