<script setup lang="ts">
import type { OperationRecord } from '@ciels/devtool-protocol';
import { useTimer } from '@vuetify/v0';
import {
  ButtonRoot,
  InputControl,
  InputRoot,
  SplitterHandle,
  SplitterPanel,
  SplitterRoot,
} from '@vuetify/v0/components';
import { computed, defineAsyncComponent, onMounted, shallowRef, watch } from 'vue';

import { valueText } from '@/session/value.ts';

import {
  type DevtoolTraceEntry,
  operationLabel,
  operationLane,
  operationTag,
  resolveTraceEntry,
} from './model.ts';
import TraceInspector from './TraceInspector.vue';
import TraceList from './TraceList.vue';

const TraceTimeline = defineAsyncComponent(() => import('./TraceTimeline.vue'));

const props = defineProps<{
  operations: readonly OperationRecord[];
  trace: readonly DevtoolTraceEntry[];
}>();
const query = shallowRef('');
const selectedId = shallowRef('');
const inspectorOpen = shallowRef(true);
const now = shallowRef(Date.now());
const clock = useTimer(
  () => {
    now.value = Date.now();
  },
  { duration: 250, repeat: true },
);
const visible = computed(() =>
  props.operations.filter(operation => resolveTraceEntry(operation, props.trace)),
);
const filtered = computed(() => {
  const normalized = query.value.trim().toLocaleLowerCase();
  if (!normalized) return visible.value;
  return visible.value.filter(operation =>
    [
      operationLabel(operation),
      operationTag(operation),
      operation.name,
      operation.status,
      valueText(operation.input),
      valueText(operation.output),
    ]
      .join(' ')
      .toLocaleLowerCase()
      .includes(normalized),
  );
});
const selected = computed(
  () => visible.value.find(operation => operation.id === selectedId.value) ?? filtered.value[0],
);
const start = computed(() =>
  visible.value.length
    ? Math.min(...visible.value.map(operation => operation.startedAt))
    : Date.now(),
);
const end = computed(() =>
  Math.max(...visible.value.map(operation => operation.completedAt ?? now.value), start.value + 1),
);
const toolCalls = computed(
  () => visible.value.filter(operation => operationLane(operation).id === 'tool').length,
);
const emptyLabel = computed(() => (visible.value.length ? '没有匹配的步骤' : '等待执行轨迹'));

watch(
  visible,
  semantic => {
    if (!semantic.some(operation => operation.id === selectedId.value)) {
      selectedId.value = semantic.at(-1)?.id ?? '';
    }
  },
  { immediate: true },
);

onMounted(() => {
  clock.start();
});

function selectOperation(operation: OperationRecord): void {
  selectedId.value = operation.id;
  inspectorOpen.value = true;
}

function formatDuration(duration?: number): string {
  if (duration === undefined) return 'Running';
  return duration < 1_000 ? `${duration} ms` : `${(duration / 1_000).toFixed(2)} s`;
}

function exportTrace(): void {
  const blob = new Blob([JSON.stringify(visible.value, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = `ciel-trace-${Date.now()}.json`;
  anchor.click();
  URL.revokeObjectURL(url);
}
</script>

<template>
  <section class="trace-panel">
    <header class="trace-toolbar">
      <span>{{ formatDuration(Math.max(0, end - start)) }}</span>
      <span>{{ visible.length }} Steps</span>
      <span>{{ toolCalls }} Calls</span>
      <ButtonRoot class="trace-toolbar-action" :disabled="!visible.length" @click="exportTrace">
        Export
      </ButtonRoot>
      <InputRoot v-model="query" class="trace-search-root">
        <InputControl class="trace-search" placeholder="搜索步骤" type="search" />
      </InputRoot>
      <ButtonRoot class="trace-toolbar-action" @click="inspectorOpen = !inspectorOpen">
        {{ inspectorOpen ? '隐藏检查器' : '显示检查器' }}
      </ButtonRoot>
    </header>

    <SplitterRoot orientation="vertical" class="trace-workspace">
      <SplitterPanel
        :default-size="26"
        :min-size="14"
        :max-size="52"
        class="dx:min-h-0 dx:overflow-hidden"
      >
        <TraceTimeline
          v-if="visible.length"
          :end="end"
          :operations="visible"
          :selected-id="selected?.id"
          :start="start"
          :trace="trace"
          @select="selectOperation"
        />
        <div v-else class="trace-empty">Waiting for the first trace</div>
      </SplitterPanel>
      <SplitterHandle label="调整时间轴高度" class="trace-splitter trace-splitter-horizontal" />
      <SplitterPanel
        :default-size="74"
        :min-size="40"
        class="trace-detail-host dx:min-h-0 dx:overflow-hidden"
      >
        <SplitterRoot v-if="inspectorOpen" orientation="horizontal" class="trace-detail">
          <SplitterPanel :default-size="62" :min-size="35">
            <TraceList
              :empty-label="emptyLabel"
              :operations="filtered"
              :selected-id="selected?.id"
              :total="visible.length"
              :trace="trace"
              @select="selectOperation"
            />
          </SplitterPanel>
          <SplitterHandle label="调整检查器宽度" class="trace-splitter trace-splitter-vertical" />
          <SplitterPanel :default-size="38" :min-size="28">
            <TraceInspector :operation="selected" :trace="trace" @close="inspectorOpen = false" />
          </SplitterPanel>
        </SplitterRoot>
        <TraceList
          v-else
          :empty-label="emptyLabel"
          :operations="filtered"
          :selected-id="selected?.id"
          :total="visible.length"
          :trace="trace"
          @select="selectOperation"
        />
      </SplitterPanel>
    </SplitterRoot>
  </section>
</template>

<style>
.trace-panel {
  display: flex;
  width: 100%;
  height: 100%;
  min-width: 0;
  min-height: 0;
  flex-direction: column;
  overflow: hidden;
  background: var(--trace-surface);
}

.trace-toolbar {
  display: flex;
  width: 100%;
  height: 32px;
  min-width: 0;
  flex: 0 0 auto;
  align-items: center;
  gap: 10px;
  border-bottom: 1px solid rgb(255 255 255 / 10%);
  background: #202122;
  padding: 0 8px;
  color: #a1a1aa;
  font-size: 10px;
  white-space: nowrap;
}

.trace-toolbar-action {
  height: 22px;
  flex: 0 0 auto;
  border: 0;
  border-radius: 3px;
  background: transparent;
  padding: 0 6px;
  color: #a1a1aa;
  font-size: 10px;
}

.trace-toolbar-action:hover {
  background: rgb(255 255 255 / 5%);
  color: #f4f4f5;
}

.trace-search-root {
  width: min(192px, 30%);
  min-width: 104px;
  margin-left: auto;
}

.trace-search {
  width: 100%;
  height: 24px;
  border: 1px solid transparent;
  border-radius: 4px;
  outline: none;
  background: #18191a;
  padding: 0 9px;
  color: #d4d4d8;
  font-size: 11px;
}

.trace-search:focus {
  border-color: color-mix(in srgb, var(--primary) 55%, transparent);
}

.trace-workspace,
.trace-detail {
  width: 100%;
  min-width: 0;
  min-height: 0;
  flex: 1;
  overflow: hidden;
}

.trace-detail-host {
  display: flex;
}

.trace-detail-host > .trace-detail,
.trace-detail-host > .trace-list-panel {
  min-height: 0;
  flex: 1;
}

.trace-splitter {
  position: relative;
  z-index: 2;
  flex: 0 0 auto;
  background: rgb(255 255 255 / 10%);
}

.trace-splitter:hover,
.trace-splitter[data-resize-handle-active] {
  background: var(--primary);
}

.trace-splitter-horizontal {
  width: 100%;
  height: 1px;
}

.trace-splitter-vertical {
  width: 1px;
  height: 100%;
}

.trace-empty {
  display: grid;
  width: 100%;
  height: 100%;
  place-items: center;
  background: #292a2b;
  color: #52525b;
  font-size: 12px;
}
</style>
