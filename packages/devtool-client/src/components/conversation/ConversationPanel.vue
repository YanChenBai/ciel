<script setup lang="ts">
import type { EngramEntryRecord, OperationRecord } from '@ciels/devtool-protocol';
import { computed, nextTick, shallowRef, useTemplateRef, watch } from 'vue';

import { buildConversationItems } from './items.ts';

const props = defineProps<{
  entries: readonly EngramEntryRecord[];
  operations: readonly OperationRecord[];
}>();
const scroll = useTemplateRef<HTMLElement>('scroll');
const hovered = shallowRef(false);

const items = computed(() => buildConversationItems(props.entries, props.operations));

watch(
  () => items.value.length,
  async () => {
    if (hovered.value) return;
    await nextTick();
    scrollToEnd();
  },
  { immediate: true, flush: 'post' },
);

function scrollToEnd(): void {
  if (scroll.value) scroll.value.scrollTop = scroll.value.scrollHeight;
}

function resume(): void {
  hovered.value = false;
  scrollToEnd();
}

function formatClock(time?: number): string {
  if (time === undefined) return '—';
  return new Intl.DateTimeFormat('zh-CN', {
    hour: '2-digit',
    hour12: false,
    minute: '2-digit',
    second: '2-digit',
  }).format(time);
}
</script>

<template>
  <section
    ref="scroll"
    class="dx:h-full dx:overflow-y-auto dx:bg-[#1c1d1e]"
    @mouseenter="hovered = true"
    @mouseleave="resume"
  >
    <div v-if="items.length">
      <article
        v-for="item in items"
        :key="item.id"
        class="dx:grid dx:min-h-24 dx:grid-cols-[86px_minmax(0,1fr)] dx:border-b dx:border-white/7"
      >
        <div class="dx:flex dx:justify-end dx:px-3 dx:py-5">
          <strong class="conversation-label" :class="`conversation-${item.kind}`">{{
            item.label
          }}</strong>
        </div>
        <div class="dx:min-w-0 dx:py-5 dx:pr-6">
          <pre
            class="dx:whitespace-pre-wrap dx:break-words dx:font-sans dx:text-sm dx:leading-6 dx:text-zinc-100"
            >{{ item.text }}</pre>
          <p class="dx:mt-2 dx:font-mono dx:text-[10px] dx:text-zinc-600">
            {{ item.metadata }} · {{ formatClock(item.time) }}
          </p>
        </div>
      </article>
    </div>
    <div v-else class="dx:grid dx:h-full dx:place-items-center dx:px-6 dx:text-center">
      <p class="dx:text-sm dx:text-zinc-500">等待 ASR、Thinking 或弹幕发送</p>
    </div>
  </section>
</template>

<style scoped>
.conversation-label {
  height: fit-content;
  border-radius: 3px;
  background: #64748b;
  padding: 2px 6px;
  color: #202123;
  font-family: SFMono-Regular, Consolas, monospace;
  font-size: 10px;
  letter-spacing: 0.08em;
}

.conversation-asr {
  background: var(--trace-asr);
}

.conversation-thinking {
  background: var(--trace-model);
}

.conversation-danmaku-simulated {
  background: var(--trace-tool);
}

.conversation-danmaku-real {
  background: var(--trace-vision);
}
</style>
