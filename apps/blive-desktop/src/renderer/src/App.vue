<script setup lang="ts">
import { CielDevTools } from '@ciels/devtools';
import {
  Check,
  ChevronDown,
  ChevronsUpDown,
  LogIn,
  LogOut,
  Play,
  Radio,
  Square,
} from '@lucide/vue';
import {
  ComboboxContent,
  ComboboxEmpty,
  ComboboxGroup,
  ComboboxInput,
  ComboboxItem,
  ComboboxItemIndicator,
  ComboboxLabel,
  ComboboxRoot,
  ComboboxTrigger,
  ComboboxViewport,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuPortal,
  DropdownMenuRoot,
  DropdownMenuTrigger,
} from 'reka-ui';
import { computed, nextTick, onBeforeUnmount, onMounted, ref, shallowRef, watch } from 'vue';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select';
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from '@/components/ui/resizable';

import type {
  BilibiliLiveAreaGroup,
  BliveDesktopState,
  BliveMode,
  DanmakuDelivery,
} from '../../shared/types.ts';

const state = shallowRef<BliveDesktopState>();
const DEFAULT_AREA_URL = areaUrlFor(9, 0);
const roomId = ref('');
const mode = ref<BliveMode>('standard');
const danmakuDelivery = ref<DanmakuDelivery>('simulate');
const areaUrl = ref(DEFAULT_AREA_URL);
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
const areaLabels = computed(() => {
  const labels = new Map<string, string>([[DEFAULT_AREA_URL, '虚拟主播 · 全部']]);
  for (const group of areas.value) {
    labels.set(areaUrlFor(group.id, 0), `${group.name} · 全部`);
    for (const area of group.areas) {
      labels.set(areaUrlFor(group.id, area.id), `${group.name} · ${area.name}`);
    }
  }
  return labels;
});

onMounted(async () => {
  try {
    if (!window.blive) throw new Error('Electron preload 未加载，请完全退出应用后重新启动');
    state.value = await window.blive.state.get();
    areasPending.value = true;
    void window.blive.areas
      .list()
      .then(value => {
        areas.value = value;
      })
      .catch(error => {
        localError.value = formatCommandError(error);
      })
      .finally(() => {
        areasPending.value = false;
      });
    stopEvents = window.blive.state.subscribe(event => {
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
  return run(() => window.blive.runtime.start(options));
}

function areaUrlFor(parentAreaId: number, areaId: number): string {
  const query = new URLSearchParams({ areaId: String(areaId), parentAreaId: String(parentAreaId) });
  return `https://live.bilibili.com/p/eden/area-tags?${query}`;
}

function areaLabelForUrl(value: unknown): string {
  return typeof value === 'string' ? (areaLabels.value.get(value) ?? '') : '';
}

function stop(): Promise<void> {
  return run(() => window.blive.runtime.stop());
}

function login(): Promise<void> {
  return run(() => window.blive.account.login());
}

function logout(): Promise<void> {
  return run(() => window.blive.account.logout());
}

function updateLiveBounds(): void {
  const rect = liveHost.value?.getBoundingClientRect();
  if (!rect) return;
  window.blive.liveView.setBounds({
    height: rect.height,
    width: rect.width,
    x: rect.x,
    y: rect.y,
  });
}
</script>

<template>
  <main class="bg-background flex h-full flex-col">
    <header
      class="border-border flex h-[41px] shrink-0 items-center gap-2.5 border-b bg-[#1c1d1e] py-1 pr-[150px] pl-3.5 [-webkit-app-region:drag]"
    >
      <div
        v-if="state?.running"
        class="flex min-w-0 items-center gap-2 [-webkit-app-region:no-drag]"
      >
        <Radio class="text-primary size-[15px]" />
        <strong class="truncate text-xs font-medium text-[#eeeeef]">{{ title }}</strong>
        <Badge
          variant="outline"
          class="bg-muted text-muted-foreground text-[10px]"
          :class="
            state.mode === 'autonomous' ? 'border-[#3c6654] bg-[#20382d] text-[#94d7b5]' : undefined
          "
          >{{ modeLabel }}</Badge
        >
        <Badge variant="outline" class="bg-muted text-muted-foreground text-[10px]">
          {{ state.danmakuDelivery === 'live' ? '真实弹幕' : '测试弹幕' }}
        </Badge>
      </div>
      <Button
        v-if="state?.running"
        type="button"
        variant="destructive"
        size="xs"
        class="h-6 gap-1 px-[7px] text-[11px] leading-none [-webkit-app-region:no-drag] [&_svg]:size-3"
        :disabled="pending"
        @click="stop"
      >
        <Square data-icon="inline-start" />
        停止
      </Button>
      <div class="ml-auto flex items-center gap-1 text-[11px] [-webkit-app-region:no-drag]">
        <DropdownMenuRoot v-if="state?.account">
          <DropdownMenuTrigger as-child>
            <Button
              type="button"
              variant="ghost"
              size="xs"
              class="h-7 gap-1.5 px-1.5 text-[11px] font-normal text-[#eeeeef] hover:bg-white/10 hover:text-white [&_svg]:size-3"
              :disabled="pending"
            >
              <img
                v-if="state.account.face"
                :src="state.account.face"
                :alt="state.account.name"
                referrerpolicy="no-referrer"
                class="size-5 rounded-full"
              />
              <span class="max-w-32 truncate">{{ state.account.name }}</span>
              <ChevronDown class="text-[#8b8d92]" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuPortal>
            <DropdownMenuContent
              align="end"
              :side-offset="6"
              class="border-border bg-popover text-popover-foreground z-50 min-w-36 rounded-lg border p-1 shadow-xl"
            >
              <DropdownMenuItem
                class="focus:bg-destructive/15 focus:text-destructive text-destructive flex cursor-default items-center gap-2 rounded-md px-2 py-1.5 text-xs outline-none data-[disabled]:pointer-events-none data-[disabled]:opacity-50"
                :disabled="pending"
                @select="logout"
              >
                <LogOut class="size-3.5" />
                退出账号
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenuPortal>
        </DropdownMenuRoot>
        <span v-else>未登录</span>
        <Button
          v-if="!state?.account"
          type="button"
          variant="outline"
          size="xs"
          class="h-6 gap-1 px-[7px] text-[11px] leading-none [&_svg]:size-3"
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
            <ComboboxRoot
              v-model="areaUrl"
              class="relative w-full"
              :disabled="areasPending"
              open-on-click
              open-on-focus
            >
              <ComboboxInput
                id="area-url"
                :display-value="areaLabelForUrl"
                :placeholder="areasPending ? '正在获取分区…' : '搜索直播分区'"
                class="border-input placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-ring/50 h-[38px] w-full rounded-[10px] border bg-[#171819] py-1 pr-9 pl-2.5 text-sm outline-none focus-visible:ring-3 disabled:cursor-not-allowed disabled:opacity-50"
              />
              <ComboboxTrigger
                class="text-muted-foreground absolute top-0 right-0 grid h-[38px] w-9 place-items-center outline-none"
              >
                <ChevronsUpDown class="size-4" />
              </ComboboxTrigger>
              <ComboboxContent
                class="border-border bg-popover text-popover-foreground absolute top-[42px] left-0 z-50 max-h-72 w-full overflow-hidden rounded-[10px] border p-1 shadow-lg"
              >
                <ComboboxViewport>
                  <ComboboxEmpty class="text-muted-foreground px-2 py-6 text-center text-xs">
                    没有匹配的直播分区
                  </ComboboxEmpty>
                  <ComboboxGroup v-for="group in areas" :key="group.id">
                    <ComboboxLabel
                      class="text-muted-foreground px-2 py-1.5 text-[11px] font-medium"
                    >
                      {{ group.name }}
                    </ComboboxLabel>
                    <ComboboxItem
                      :value="areaUrlFor(group.id, 0)"
                      :text-value="`${group.name} 全部`"
                      class="data-[highlighted]:bg-accent data-[highlighted]:text-accent-foreground relative flex cursor-default items-center rounded-md py-1.5 pr-8 pl-2 text-sm outline-none"
                    >
                      {{ group.name }} · 全部
                      <ComboboxItemIndicator class="absolute right-2">
                        <Check class="size-4" />
                      </ComboboxItemIndicator>
                    </ComboboxItem>
                    <ComboboxItem
                      v-for="area in group.areas"
                      :key="area.id"
                      :value="areaUrlFor(group.id, area.id)"
                      :text-value="`${group.name} ${area.name}`"
                      class="data-[highlighted]:bg-accent data-[highlighted]:text-accent-foreground relative flex cursor-default items-center rounded-md py-1.5 pr-8 pl-4 text-sm outline-none"
                    >
                      {{ area.name }}
                      <ComboboxItemIndicator class="absolute right-2">
                        <Check class="size-4" />
                      </ComboboxItemIndicator>
                    </ComboboxItem>
                  </ComboboxGroup>
                </ComboboxViewport>
              </ComboboxContent>
            </ComboboxRoot>
            <p class="m-0 text-[11px] leading-normal text-[#74767c]">
              分区和直播间候选均通过 Bilibili API 实时获取。
            </p>
          </div>
        </div>

        <div class="grid justify-items-center gap-2.5">
          <Button
            type="submit"
            size="lg"
            class="h-[42px] w-full rounded-[10px]"
            :disabled="pending || !canStart"
          >
            <Play data-icon="inline-start" />
            {{ pending ? '正在启动…' : '开始观看' }}
          </Button>
          <span class="text-[10px] text-[#66686e]">AI 配置仅在开始后加载</span>
        </div>
      </form>
    </section>

    <ResizablePanelGroup
      v-show="state?.running"
      direction="horizontal"
      class="min-h-0 flex-1 overflow-hidden"
    >
      <ResizablePanel :default-size="56" :min-size="36">
        <div class="border-border h-full min-h-0 min-w-0 border-r">
          <div
            ref="liveHost"
            class="grid h-full min-h-0 place-items-center bg-[#0b0c0e] text-[13px] text-[#666b74]"
          />
        </div>
      </ResizablePanel>

      <ResizableHandle
        class="bg-border hover:bg-primary/55 data-[resize-handle-active]:bg-primary/55 z-10 w-px transition-colors"
        with-handle
      />

      <ResizablePanel :default-size="44" :min-size="28">
        <div class="h-full min-h-0 min-w-0 overflow-hidden [&>*]:!h-full [&>*]:!min-h-0">
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
