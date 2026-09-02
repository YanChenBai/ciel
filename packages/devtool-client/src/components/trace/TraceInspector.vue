<script setup lang="ts">
import type { OperationRecord } from '@ciels/devtool-protocol';
import { ButtonRoot, TabsItem, TabsList, TabsPanel, TabsRoot } from '@vuetify/v0/components';
import { shallowRef } from 'vue';

import ObjectInspector from '@/components/object/ObjectInspector.vue';
import { deserializeValue } from '@/session/value.ts';

import type { DevtoolTraceEntry } from './model.ts';
import { operationColor, operationLabel, operationTag } from './model.ts';

const props = defineProps<{
  operation?: OperationRecord;
  trace: readonly DevtoolTraceEntry[];
}>();
const emit = defineEmits<{ close: [] }>();
const tab = shallowRef('summary');

function formatClock(time?: number): string {
  if (time === undefined) return '—';
  return new Intl.DateTimeFormat('zh-CN', {
    fractionalSecondDigits: 3,
    hour: '2-digit',
    hour12: false,
    minute: '2-digit',
    second: '2-digit',
  }).format(time);
}

function formatDuration(duration?: number): string {
  if (duration === undefined) return 'Running';
  return duration < 1_000 ? `${duration} ms` : `${(duration / 1_000).toFixed(2)} s`;
}

function laneColor(operation: OperationRecord): string {
  return operationColor(operation, props.trace);
}
</script>

<template>
  <aside
    class="trace-inspector"
    :class="{ 'trace-inspector-failed': operation?.status === 'failed' }"
  >
    <header class="inspector-header">
      <span
        class="inspector-tag"
        :style="operation ? { backgroundColor: laneColor(operation) } : undefined"
      >
        {{ operation ? operationTag(operation) : 'STEP' }}
      </span>
      <strong class="inspector-title">
        {{ operation ? operationLabel(operation) : 'No selection' }}
      </strong>
      <ButtonRoot class="inspector-close" aria-label="隐藏检查器" @click="emit('close')">
        ×
      </ButtonRoot>
    </header>
    <TabsRoot v-model="tab" class="dx:flex dx:min-h-0 dx:flex-1 dx:flex-col">
      <TabsList class="dx:flex dx:h-9 dx:shrink-0 dx:border-b dx:border-white/8">
        <TabsItem
          v-for="value in ['summary', 'payload', 'result', 'events']"
          :key="value"
          :value="value"
          class="inspector-tab"
        >
          {{ value }}
        </TabsItem>
      </TabsList>
      <div class="dx:flex dx:min-h-0 dx:flex-1 dx:overflow-hidden">
        <TabsPanel value="summary" class="inspector-summary-panel dx:p-4">
          <dl
            v-if="operation"
            class="dx:grid dx:grid-cols-[82px_minmax(0,1fr)] dx:gap-y-2.5 dx:text-xs"
          >
            <dt class="dx:text-zinc-600">Status</dt>
            <dd class="dx:text-zinc-300">{{ operation.status }}</dd>
            <dt class="dx:text-zinc-600">Started</dt>
            <dd class="dx:font-mono dx:text-zinc-400">{{ formatClock(operation.startedAt) }}</dd>
            <dt class="dx:text-zinc-600">Duration</dt>
            <dd class="dx:font-mono dx:text-zinc-400">
              {{ formatDuration(operation.durationMs) }}
            </dd>
            <dt class="dx:text-zinc-600">Operation</dt>
            <dd class="dx:break-all dx:font-mono dx:text-zinc-500">{{ operation.id }}</dd>
            <dt class="dx:text-zinc-600">Parent</dt>
            <dd class="dx:break-all dx:font-mono dx:text-zinc-500">
              {{ operation.parentId ?? '—' }}
            </dd>
            <dt v-if="operation.error" class="dx:text-red-400">Error</dt>
            <dd v-if="operation.error" class="dx:text-red-300">{{ operation.error.message }}</dd>
          </dl>
          <p v-else class="dx:text-xs dx:text-zinc-600">选择一项轨迹查看详情。</p>
        </TabsPanel>
        <TabsPanel value="payload" class="inspector-object-panel dx:p-3">
          <ObjectInspector :deep="2" :value="operation ? deserializeValue(operation.input) : ''" />
        </TabsPanel>
        <TabsPanel value="result" class="inspector-object-panel dx:p-3">
          <ObjectInspector :deep="2" :value="operation ? deserializeValue(operation.output) : ''" />
        </TabsPanel>
        <TabsPanel value="events" class="inspector-object-panel dx:p-3">
          <ObjectInspector :deep="2" :value="operation ?? ''" />
        </TabsPanel>
      </div>
    </TabsRoot>
  </aside>
</template>

<style>
.trace-inspector {
  display: flex;
  width: 100%;
  height: 100%;
  min-width: 0;
  min-height: 0;
  flex-direction: column;
  overflow: hidden;
  border-left: 1px solid rgb(255 255 255 / 8%);
  background: #222324;
}

.trace-inspector-failed {
  box-shadow: inset 0 3px rgb(239 68 68 / 75%);
}

.inspector-summary-panel,
.inspector-object-panel {
  width: 100%;
  height: 100%;
  min-width: 0;
  min-height: 0;
}

.inspector-summary-panel {
  overflow: auto;
}

.inspector-object-panel {
  display: flex;
  overflow: hidden;
}

.inspector-header {
  display: grid;
  height: 44px;
  min-width: 0;
  flex: 0 0 auto;
  grid-template-columns: auto minmax(0, 1fr) 28px;
  align-items: center;
  gap: 8px;
  border-bottom: 1px solid rgb(255 255 255 / 8%);
  padding: 0 8px 0 12px;
}

.inspector-tag {
  border-radius: 3px;
  background: #64748b;
  padding: 2px 5px;
  color: #202123;
  font:
    700 9px SFMono-Regular,
    Consolas,
    monospace;
  letter-spacing: 0.04em;
}

.inspector-title {
  min-width: 0;
  overflow: hidden;
  color: #a1a1aa;
  font:
    400 11px SFMono-Regular,
    Consolas,
    monospace;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.inspector-tab {
  height: 100%;
  flex: 1;
  border: 0;
  border-bottom: 2px solid transparent;
  border-radius: 0;
  background: transparent;
  color: #71717a;
  font-size: 10px;
  text-transform: capitalize;
}

.inspector-tab[aria-selected='true'] {
  border-bottom-color: var(--primary);
  color: #e4e4e7;
}

.inspector-close {
  display: grid;
  width: 28px;
  height: 28px;
  place-items: center;
  justify-self: end;
  border: 0;
  border-radius: 3px;
  background: transparent;
  padding: 0;
  color: #71717a;
  font: 18px/1 sans-serif;
}

.inspector-close:hover {
  background: rgb(255 255 255 / 5%);
  color: #e4e4e7;
}
</style>
