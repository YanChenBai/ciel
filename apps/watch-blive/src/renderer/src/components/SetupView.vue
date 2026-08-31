<script setup lang="ts">
import { Play, Radio } from '@lucide/vue';
import {
  ButtonContent,
  ButtonRoot,
  InputControl,
  InputDescription,
  InputRoot,
  SelectActivator,
  SelectContent,
  SelectItem,
  SelectRoot,
  SelectValue,
} from '@vuetify/v0/components';

import type { DanmakuDelivery, LiveArea, WatchMode } from '../../../shared/types.ts';

defineProps<{ areas: readonly LiveArea[]; canStart: boolean; pending: boolean }>();
const areaId = defineModel<string>('areaId', { required: true });
const delivery = defineModel<DanmakuDelivery>('delivery', { required: true });
const mode = defineModel<WatchMode>('mode', { required: true });
const roomId = defineModel<string>('roomId', { required: true });
const emit = defineEmits<{ start: [] }>();
</script>

<template>
  <section
    data-view="setup"
    class="grid min-h-0 flex-1 place-items-center overflow-auto bg-[#171819] px-6 py-12"
  >
    <form class="grid w-full max-w-[420px] gap-7" @submit.prevent="emit('start')">
      <div class="grid justify-items-center gap-2 text-center">
        <div
          class="border-primary/35 bg-primary/10 text-primary grid size-10 place-items-center rounded-2xl border"
        >
          <Radio class="size-5" />
        </div>
        <h1 class="mt-2 text-xl font-semibold">进入直播间</h1>
        <p class="text-[13px] leading-6 text-zinc-500">
          直播画面、音频、记忆与遥测全部接入新的 Corex 架构。
        </p>
      </div>
      <div class="grid gap-4">
        <label class="field-label">观看模式</label>
        <SelectRoot v-model="mode"
          ><SelectActivator class="select-trigger"
            ><SelectValue v-slot="{ selectedValue }">{{
              selectedValue === 'autonomous' ? '自主模式 · 探索分区' : '标准模式 · 固定房间'
            }}</SelectValue></SelectActivator
          ><SelectContent class="select-content"
            ><SelectItem class="select-item" value="standard">标准模式 · 固定房间</SelectItem
            ><SelectItem class="select-item" value="autonomous"
              >自主模式 · 探索分区</SelectItem
            ></SelectContent
          ></SelectRoot
        >
        <InputRoot v-if="mode === 'standard'" v-model="roomId" label="直播间 ID"
          ><label class="field-label">直播间 ID</label
          ><InputControl
            class="field-control"
            inputmode="numeric"
            placeholder="输入直播间 ID"
          /><InputDescription class="field-help">不会自动切换房间</InputDescription></InputRoot
        >
        <template v-else>
          <label class="field-label">直播分区</label>
          <SelectRoot v-model="areaId">
            <SelectActivator class="select-trigger">
              <SelectValue v-slot="{ selectedValue }">
                {{
                  areas.find(area => String(area.id) === String(selectedValue))?.name ??
                  '选择直播分区'
                }}
              </SelectValue>
            </SelectActivator>
            <SelectContent class="select-content max-h-72 overflow-auto">
              <SelectItem
                v-for="area in areas"
                :key="area.id"
                class="select-item"
                :value="String(area.id)"
              >
                {{ area.name }}
              </SelectItem>
            </SelectContent>
          </SelectRoot>
          <p class="field-help">Agent 会从该分区的真实候选中选择</p>
        </template>
        <label class="field-label">弹幕执行</label>
        <SelectRoot v-model="delivery"
          ><SelectActivator class="select-trigger"
            ><SelectValue v-slot="{ selectedValue }">{{
              selectedValue === 'live' ? '真实发送' : '安全模拟'
            }}</SelectValue></SelectActivator
          ><SelectContent class="select-content"
            ><SelectItem class="select-item" value="simulate">安全模拟 · 不操作网页</SelectItem
            ><SelectItem class="select-item" value="live"
              >真实发送到直播间</SelectItem
            ></SelectContent
          ></SelectRoot
        >
      </div>
      <ButtonRoot type="submit" class="primary-button" :disabled="pending || !canStart"
        ><ButtonContent
          ><Play class="size-4" />{{ pending ? '正在启动…' : '开始观看' }}</ButtonContent
        ></ButtonRoot
      >
    </form>
  </section>
</template>
