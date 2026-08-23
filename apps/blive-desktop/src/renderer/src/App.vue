<script setup lang="ts">
import { CielDevTools } from '@ciels/devtools';
import { LogIn, Play, Radio, Square } from '@lucide/vue';
import { computed, nextTick, onBeforeUnmount, onMounted, ref, shallowRef, watch } from 'vue';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select';
import { NativeSelectOptGroup } from '@/components/ui/native-select';
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from '@/components/ui/resizable';

import type {
  BilibiliLiveAreaGroup,
  BliveDesktopState,
  BliveMode,
  DanmakuDelivery,
} from '../../shared/types.ts';

const state = shallowRef<BliveDesktopState>();
const roomId = ref('');
const mode = ref<BliveMode>('standard');
const danmakuDelivery = ref<DanmakuDelivery>('simulate');
const areaUrl = ref('');
const areas = shallowRef<readonly BilibiliLiveAreaGroup[]>([]);
const areasPending = ref(false);
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
const canStart = computed(() =>
  mode.value === 'autonomous' ? Boolean(areaUrl.value.trim()) : Boolean(roomId.value.trim()),
);

onMounted(async () => {
  try {
    if (!window.blive) throw new Error('Electron preload 未加载，请完全退出应用后重新启动');
    state.value = await window.blive.bootstrap();
    areasPending.value = true;
    void window.blive
      .listAreas()
      .then(value => {
        areas.value = value;
      })
      .catch(error => {
        localError.value = formatCommandError(error);
      })
      .finally(() => {
        areasPending.value = false;
      });
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
  const options =
    mode.value === 'autonomous'
      ? {
          areaUrl: areaUrl.value.trim(),
          danmakuDelivery: danmakuDelivery.value,
          mode: 'autonomous' as const,
        }
      : {
          danmakuDelivery: danmakuDelivery.value,
          mode: 'standard' as const,
          roomId: Number(roomId.value),
        };
  return run(() =>
    window.blive.command({
      type: 'start',
      options,
    }),
  );
}

function areaUrlFor(parentAreaId: number, areaId: number): string {
  const query = new URLSearchParams({ areaId: String(areaId), parentAreaId: String(parentAreaId) });
  return `https://live.bilibili.com/p/eden/area-tags?${query}`;
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
        <Badge variant="outline" class="mode-badge">
          {{ state.danmakuDelivery === 'live' ? '真实弹幕' : '测试弹幕' }}
        </Badge>
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
          width="30"
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

    <p
      v-if="localError || state?.error"
      class="border-destructive/45 bg-destructive/15 m-0 border-b px-3.5 py-[7px] text-xs text-[#ffb4bd]"
    >
      {{ localError || state?.error }}
    </p>

    <section
      v-if="!state?.running"
      class="grid min-h-0 flex-1 place-items-center bg-[#171819] px-6 pt-8 pb-14"
    >
      <form class="grid w-full max-w-[420px] gap-7" @submit.prevent="start">
        <div class="grid justify-items-center gap-2 text-center">
          <div
            class="border-primary/35 bg-primary/10 text-primary mb-1.5 grid size-[34px] place-items-center rounded-xl border [&_svg]:size-[17px]"
          >
            <Radio />
          </div>
          <h1 class="text-foreground mt-2 text-xl font-semibold tracking-[-0.02em]">进入直播间</h1>
          <p class="text-muted-foreground m-0 max-w-[360px] text-[13px] leading-[1.65]">
            选择观看方式，Ciel 会在开始后接收直播内容并独立思考。
          </p>
        </div>

        <div class="grid gap-5">
          <div class="grid gap-[7px]">
            <Label for="watch-mode" class="text-xs font-medium text-[#d8d8da]">观看模式</Label>
            <NativeSelect
              id="watch-mode"
              v-model="mode"
              class="w-full [&_[data-slot='native-select']]:h-[38px] [&_[data-slot='native-select']]:rounded-[10px] [&_[data-slot='native-select']]:bg-[#171819]"
            >
              <NativeSelectOption value="standard"
                >标准模式 · 固定观看当前直播间</NativeSelectOption
              >
              <NativeSelectOption value="autonomous"
                >自主模式 · 从分区探索直播间</NativeSelectOption
              >
            </NativeSelect>
            <p class="m-0 text-[11px] leading-normal text-[#74767c]">
              {{
                mode === 'autonomous'
                  ? 'Agent 会评估内容质量并决定继续停留或切换。'
                  : '只观看指定直播间，不会自动切换。'
              }}
            </p>
          </div>
          <div v-if="mode === 'standard'" class="grid gap-[7px]">
            <Label for="room-id" class="text-xs font-medium text-[#d8d8da]">直播间 ID</Label>
            <Input
              id="room-id"
              v-model="roomId"
              class="h-[38px] w-full rounded-[10px] bg-[#171819]"
              inputmode="numeric"
              placeholder="输入直播间 ID"
            />
          </div>
          <div class="grid gap-[7px]">
            <Label for="danmaku-delivery" class="text-xs font-medium text-[#d8d8da]"
              >弹幕执行</Label
            >
            <NativeSelect
              id="danmaku-delivery"
              v-model="danmakuDelivery"
              class="w-full [&_[data-slot='native-select']]:h-[38px] [&_[data-slot='native-select']]:rounded-[10px] [&_[data-slot='native-select']]:bg-[#171819]"
            >
              <NativeSelectOption value="simulate">仅测试工具调用 · 不发送</NativeSelectOption>
              <NativeSelectOption value="live">真实发送到直播间</NativeSelectOption>
            </NativeSelect>
            <p class="m-0 text-[11px] leading-normal text-[#74767c]">
              {{
                danmakuDelivery === 'live'
                  ? 'Agent 调用工具后会操作直播网页发送弹幕。'
                  : '保留完整工具调用与轨迹，但不会操作网页或写入发送历史。'
              }}
            </p>
          </div>
          <div v-if="mode === 'autonomous'" class="grid gap-[7px]">
            <Label for="area-url" class="text-xs font-medium text-[#d8d8da]">直播分区</Label>
            <NativeSelect
              id="area-url"
              v-model="areaUrl"
              class="w-full [&_[data-slot='native-select']]:h-[38px] [&_[data-slot='native-select']]:rounded-[10px] [&_[data-slot='native-select']]:bg-[#171819]"
              :disabled="areasPending"
            >
              <NativeSelectOption value="" disabled>
                {{ areasPending ? '正在获取分区…' : '选择直播分区' }}
              </NativeSelectOption>
              <NativeSelectOptGroup v-for="group in areas" :key="group.id" :label="group.name">
                <NativeSelectOption :value="areaUrlFor(group.id, 0)">
                  {{ group.name }} · 全部
                </NativeSelectOption>
                <NativeSelectOption
                  v-for="area in group.areas"
                  :key="area.id"
                  :value="areaUrlFor(group.id, area.id)"
                >
                  {{ area.name }}
                </NativeSelectOption>
              </NativeSelectOptGroup>
            </NativeSelect>
            <p class="m-0 text-[11px] leading-normal text-[#74767c]">
              分区和直播间候选均通过 Bilibili API 实时获取。
            </p>
          </div>
        </div>

        <div class="launch-actions">
          <Button type="submit" size="lg" :disabled="pending || !canStart">
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
            :asset-base-url="state.assetBaseUrl"
            :connected="state.connected"
            :events="state.events"
            :snapshot="state.snapshot"
          />
        </div>
      </ResizablePanel>
    </ResizablePanelGroup>
  </main>
</template>
