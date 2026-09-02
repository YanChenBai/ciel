<script setup lang="ts">
import type { OperationRecord } from '@ciels/devtool-protocol';
import { ButtonRoot } from '@vuetify/v0/components';

import { valueText } from '@/session/value.ts';

import type { DevtoolTraceEntry } from './model.ts';
import { operationColor, operationLabel, operationTag } from './model.ts';

const props = defineProps<{
  emptyLabel: string;
  operations: readonly OperationRecord[];
  selectedId?: string;
  total: number;
  trace: readonly DevtoolTraceEntry[];
}>();
const emit = defineEmits<{ select: [operation: OperationRecord] }>();

function preview(operation: OperationRecord): string {
  return valueText(operation.output.type === 'omitted' ? operation.input : operation.output)
    .replaceAll(/\s+/g, ' ')
    .slice(0, 160);
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
  <div class="trace-list-panel">
    <div class="trace-list-header">Trace · {{ total }} steps</div>
    <div class="trace-list">
      <ButtonRoot
        v-for="operation in operations"
        :key="operation.id"
        class="trace-row"
        :class="{
          failed: operation.status === 'failed',
          selected: selectedId === operation.id,
        }"
        @click="emit('select', operation)"
      >
        <span class="trace-category" :style="{ backgroundColor: laneColor(operation) }">
          {{ operationTag(operation) }}
        </span>
        <strong class="trace-title">{{ operationLabel(operation) }}</strong>
        <small class="trace-preview">{{ preview(operation) }}</small>
        <span class="trace-status-label" :class="`trace-status-label-${operation.status}`">
          <i class="trace-status" :class="`trace-status-${operation.status}`" />
          {{ operation.status }}
        </span>
        <time class="trace-time">{{ formatDuration(operation.durationMs) }}</time>
      </ButtonRoot>
      <p v-if="!operations.length" class="trace-empty-list">{{ emptyLabel }}</p>
    </div>
  </div>
</template>

<style>
.trace-list-panel {
  display: flex;
  width: 100%;
  height: 100%;
  min-width: 0;
  min-height: 0;
  flex-direction: column;
  overflow: hidden;
  background: #1c1d1e;
}

.trace-list-header {
  display: flex;
  height: 24px;
  flex: 0 0 auto;
  align-items: center;
  border-bottom: 1px solid rgb(255 255 255 / 6%);
  background: #18191a;
  padding: 0 8px;
  color: #52525b;
  font:
    9px SFMono-Regular,
    Consolas,
    monospace;
}

.trace-list {
  min-width: 0;
  min-height: 0;
  flex: 1;
  overflow: auto;
}

.trace-row {
  display: grid;
  width: 100%;
  height: 42px;
  min-width: 560px;
  grid-template-columns: 68px 120px minmax(120px, 1fr) 82px 72px;
  align-items: center;
  gap: 12px;
  border: 0;
  border-bottom: 1px solid rgb(255 255 255 / 5%);
  border-radius: 0;
  background: transparent;
  padding: 0 12px;
  color: inherit;
  text-align: left;
}

.trace-row:hover,
.trace-row.selected {
  background: rgb(255 255 255 / 4%);
}

.trace-row.selected {
  background: color-mix(in srgb, var(--primary) 12%, #1c1d1e);
  box-shadow:
    inset 4px 0 var(--primary),
    inset 0 0 0 1px color-mix(in srgb, var(--primary) 45%, transparent);
}

.trace-row.failed {
  background: rgb(127 29 29 / 26%);
  box-shadow: inset 3px 0 #ef4444;
}

.trace-row.failed:hover,
.trace-row.failed.selected {
  background: rgb(153 27 27 / 38%);
}

.trace-row.failed.selected {
  box-shadow:
    inset 4px 0 #ef4444,
    inset 0 0 0 1px rgb(248 113 113 / 70%);
}

.trace-category {
  width: fit-content;
  max-width: 100%;
  overflow: hidden;
  border-radius: 3px;
  background: #64748b;
  padding: 2px 5px;
  color: #202123;
  font:
    9px SFMono-Regular,
    Consolas,
    monospace;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.trace-title,
.trace-preview,
.trace-status-label,
.trace-time {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.trace-title {
  color: #e4e4e7;
  font:
    400 11px SFMono-Regular,
    Consolas,
    monospace;
}

.trace-preview {
  color: #71717a;
  font:
    10px SFMono-Regular,
    Consolas,
    monospace;
}

.trace-status-label {
  display: flex;
  align-items: center;
  gap: 6px;
  color: #71717a;
  font:
    9px SFMono-Regular,
    Consolas,
    monospace;
  text-transform: capitalize;
}

.trace-status-label-failed {
  color: #fca5a5;
  font-weight: 700;
}

.trace-status {
  width: 6px;
  height: 6px;
  flex: 0 0 auto;
  border-radius: 999px;
  background: #71717a;
}

.trace-status-completed {
  background: #4ade80;
}

.trace-status-failed {
  background: #ef4444;
  box-shadow: 0 0 0 2px rgb(239 68 68 / 20%);
}

.trace-status-running {
  background: #fbbf24;
}

.trace-time {
  padding-right: 2px;
  color: #52525b;
  font:
    9px SFMono-Regular,
    Consolas,
    monospace;
  text-align: right;
}

.trace-empty-list {
  display: grid;
  min-height: 192px;
  place-items: center;
  margin: 0;
  color: #52525b;
  font-size: 12px;
}
</style>
