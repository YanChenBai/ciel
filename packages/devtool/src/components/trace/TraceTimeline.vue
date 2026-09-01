<script setup lang="ts">
import type { OperationRecord } from '@ciels/devtool-protocol';
import { useResizeObserver } from '@vuetify/v0/composables';
import type { DataGroup, DataItem, TimelineOptions } from 'vis-timeline/standalone';
import { Timeline } from 'vis-timeline/standalone';
import { computed, onBeforeUnmount, onMounted, shallowRef, useTemplateRef, watch } from 'vue';

import 'vis-timeline/styles/vis-timeline-graph2d.min.css';

import { operationLabel, operationLane, traceLanes } from './model.ts';

const props = defineProps<{
  end: number;
  operations: readonly OperationRecord[];
  selectedId?: string;
  start: number;
}>();
const emit = defineEmits<{ select: [operation: OperationRecord] }>();
const root = useTemplateRef<HTMLElement>('root');
const hovered = shallowRef(false);
let timeline: Timeline | undefined;
const minimumWindow = 15_000;

const groups = computed<DataGroup[]>(() =>
  traceLanes.map(lane => ({
    className: `trace-group trace-group-${lane.id}`,
    content: lane.label,
    id: lane.id,
  })),
);
const items = computed<DataItem[]>(() =>
  props.operations.map(operation => ({
    className: `trace-item trace-item-${operationLane(operation)} trace-item-${operation.status}`,
    content: '',
    end: new Date(operation.completedAt ?? props.end),
    group: operationLane(operation),
    id: operation.id,
    start: new Date(operation.startedAt),
    title: `${operationLabel(operation)} · ${formatDuration(operation.durationMs)}`,
    type: 'range',
  })),
);

useResizeObserver(root, entries => {
  const height = Math.floor(entries[0]?.contentRect.height ?? 0);
  if (height > 0) timeline?.setOptions({ height });
});

onMounted(() => {
  if (!root.value) return;
  const range = timelineRange(props.start, props.end);
  const options: TimelineOptions = {
    autoResize: true,
    editable: false,
    end: new Date(range.end),
    format: { minorLabels: date => formatOffset(Number(date) - props.start) },
    groupHeightMode: 'auto',
    groupOrder: (left, right) =>
      traceLanes.findIndex(lane => lane.id === left.id) -
      traceLanes.findIndex(lane => lane.id === right.id),
    height: Math.max(120, root.value.clientHeight),
    margin: { axis: 0, item: { horizontal: 0, vertical: 4 } },
    max: new Date(range.max),
    min: new Date(range.min),
    moveable: true,
    orientation: { axis: 'top', item: 'top' },
    selectable: true,
    showCurrentTime: false,
    showMajorLabels: false,
    showMinorLabels: true,
    stack: false,
    start: new Date(range.start),
    verticalScroll: true,
    zoomKey: 'ctrlKey',
    zoomMax: Math.max(minimumWindow, props.end - props.start) * 24,
    zoomMin: Math.min(10, Math.max(1, props.end - props.start)),
    zoomable: true,
  };
  timeline = new Timeline(root.value, items.value, groups.value, options);
  timeline.on('select', properties => {
    const selected = (properties as { items?: readonly (number | string)[] }).items?.[0];
    const operation = props.operations.find(candidate => candidate.id === selected);
    if (operation) emit('select', operation);
  });
});

watch(items, value => timeline?.setItems(value));
watch(groups, value => timeline?.setGroups(value));
watch(
  () => props.selectedId,
  value => timeline?.setSelection(value ? [value] : []),
);
watch(
  () => [props.start, props.end] as const,
  ([start, end]) => {
    if (!hovered.value) followLatest(start, end);
  },
);

onBeforeUnmount(() => timeline?.destroy());

function followLatest(start = props.start, end = props.end): void {
  const range = timelineRange(start, end);
  timeline?.setOptions({
    max: new Date(range.max),
    min: new Date(range.min),
    zoomMax: Math.max(minimumWindow, end - start) * 24,
  });
  timeline?.setWindow(new Date(range.start), new Date(range.end), { animation: false });
}

function resumeFollowing(): void {
  hovered.value = false;
  followLatest();
}

function timelineRange(start: number, end: number) {
  const contentDuration = Math.max(1, end - start);
  const windowDuration = Math.max(minimumWindow, contentDuration);
  const padding = Math.max(250, windowDuration * 0.025);
  const visibleEnd = end + padding;
  const visibleStart = Math.min(start, visibleEnd - windowDuration - padding);
  return {
    end: visibleEnd,
    max: visibleEnd + windowDuration * 12,
    min: visibleStart - windowDuration * 12,
    start: visibleStart,
  };
}

function formatDuration(duration?: number): string {
  if (duration === undefined) return 'Running';
  return duration < 1_000 ? `${duration} ms` : `${(duration / 1_000).toFixed(2)} s`;
}

function formatOffset(offset: number): string {
  if (offset < 0) return '';
  return Math.abs(offset) < 1_000 ? `${Math.round(offset)} ms` : `${(offset / 1_000).toFixed(1)} s`;
}
</script>

<template>
  <div
    ref="root"
    class="trace-timeline"
    aria-label="执行轨迹时间轴；拖动横向平移，Ctrl 加滚轮缩放，滚轮纵向滚动"
    @mouseenter="hovered = true"
    @mouseleave="resumeFollowing"
  />
</template>

<style scoped>
.trace-timeline {
  height: 100%;
  min-height: 0;
  overflow: hidden;
  background: #292a2b;
}

.trace-timeline :deep(.vis-timeline),
.trace-timeline :deep(.vis-panel),
.trace-timeline :deep(.vis-labelset .vis-label),
.trace-timeline :deep(.vis-foreground .vis-group) {
  border-color: #343537 !important;
}

.trace-timeline :deep(.vis-panel.vis-left) {
  width: 80px !important;
  border-right-color: #343537 !important;
  background: #292a2b;
}

.trace-timeline :deep(.vis-panel.vis-center),
.trace-timeline :deep(.vis-panel.vis-background),
.trace-timeline :deep(.vis-panel.vis-top),
.trace-timeline :deep(.vis-panel.vis-bottom) {
  left: 80px !important;
}

.trace-timeline :deep(.vis-labelset .vis-label),
.trace-timeline :deep(.vis-foreground .vis-group) {
  min-height: 22px;
  box-sizing: border-box;
}

.trace-timeline :deep(.vis-labelset .vis-label .vis-inner) {
  display: flex;
  box-sizing: border-box;
  min-height: 22px;
  align-items: center;
  padding: 0 14px;
  color: #626268;
  font:
    10px/13px SFMono-Regular,
    Consolas,
    monospace;
}

.trace-timeline :deep(.vis-time-axis) {
  background: #252627;
}

.trace-timeline :deep(.vis-time-axis .vis-text) {
  padding-top: 4px;
  color: #626268;
  font:
    9px/13px SFMono-Regular,
    Consolas,
    monospace;
}

.trace-timeline :deep(.vis-panel .vis-grid) {
  border-color: #343537 !important;
}

.trace-timeline :deep(.vis-item.trace-item) {
  min-width: 8px;
  height: 10px;
  border: 0;
  border-radius: 1px;
  top: 6px !important;
  cursor: pointer;
}

.trace-timeline :deep(.vis-item.trace-item .vis-item-content) {
  display: none;
}

.trace-timeline :deep(.vis-item.trace-item-agent) {
  background: #94a3b8;
}

.trace-timeline :deep(.vis-item.trace-item-context) {
  background: var(--trace-context);
}

.trace-timeline :deep(.vis-item.trace-item-model) {
  background: var(--trace-model);
}

.trace-timeline :deep(.vis-item.trace-item-tool) {
  background: var(--trace-tool);
}

.trace-timeline :deep(.vis-item.trace-item-room) {
  background: var(--trace-vision);
}

.trace-timeline :deep(.vis-item.trace-item-running) {
  animation: trace-pulse 1.1s ease-in-out infinite;
}

.trace-timeline :deep(.vis-item.trace-item-failed) {
  background: #f87171;
}

.trace-timeline :deep(.vis-item.vis-selected) {
  outline: 1px solid var(--primary);
  outline-offset: 2px;
}

@keyframes trace-pulse {
  50% {
    opacity: 0.42;
  }
}
</style>
