<script setup lang="ts">
import { SplitterHandle, SplitterPanel, SplitterRoot } from '@vuetify/v0/components';
import { toRef, useTemplateRef } from 'vue';

import type { AppState } from '../../../shared/types.ts';
import { useLiveView } from '../composables/useLiveView.ts';

const props = defineProps<{ state: AppState; visible: boolean }>();
const host = useTemplateRef<HTMLElement>('host');
useLiveView(host, toRef(props, 'visible'));
</script>

<template>
  <SplitterRoot orientation="horizontal" class="flex min-h-0 flex-1 overflow-hidden bg-[#0b0c0e]">
    <SplitterPanel :default-size="76" :min-size="45"
      ><div ref="host" class="h-full min-h-0 min-w-0"
    /></SplitterPanel>
    <SplitterHandle
      label="调整直播区域宽度"
      class="group hover:bg-primary relative z-10 w-px bg-white/10"
      ><span
        class="group-hover:bg-primary absolute top-1/2 left-1/2 h-10 w-1 -translate-1/2 rounded-full bg-zinc-700"
    /></SplitterHandle>
    <SplitterPanel :default-size="24" :min-size="18" class="bg-[#171819]"
      ><aside class="h-full overflow-auto border-l border-white/8 p-5">
        <p class="eyebrow">CURRENT ROOM</p>
        <h2 class="mt-2 font-semibold">{{ state.room?.streamerName ?? '正在选择直播间' }}</h2>
        <p class="mt-1 text-xs leading-5 text-zinc-500">
          {{ state.room?.title ?? 'Corex 已启动' }}
        </p>
        <dl class="mt-6 grid gap-4 text-xs">
          <div>
            <dt class="text-zinc-600">模式</dt>
            <dd class="mt-1">{{ state.mode === 'autonomous' ? '自主探索' : '固定观看' }}</dd>
          </div>
          <div>
            <dt class="text-zinc-600">弹幕</dt>
            <dd class="mt-1">{{ state.danmakuDelivery === 'live' ? '真实发送' : '安全模拟' }}</dd>
          </div>
        </dl>
      </aside></SplitterPanel
    >
  </SplitterRoot>
</template>
