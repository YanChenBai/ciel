<script setup lang="ts">
import { useResizeObserver } from '@vueuse/core';
import type { DataGroup, DataItem, TimelineOptions } from 'vis-timeline/standalone';

import 'vis-timeline/styles/vis-timeline-graph2d.min.css';
import { Timeline } from 'vis-timeline/standalone';
import { computed, onBeforeUnmount, onMounted, useTemplateRef, watch } from 'vue';

import type { VigiliaStep, VigiliaStepLane } from '@/lib/trace';

const props = defineProps<{
  end: number;
  selectedId?: string;
  start: number;
  steps: readonly VigiliaStep[];
}>();

const emit = defineEmits<{
  select: [step: VigiliaStep];
}>();

const laneDefinitions: readonly { id: VigiliaStepLane; label: string }[] = [
  { id: 'sensory', label: 'Input' },
  { id: 'context', label: 'Context' },
  { id: 'memory', label: 'Memory' },
  { id: 'model', label: 'Model' },
  { id: 'tool', label: 'Tools' },
  { id: 'nucleus', label: 'Nucleus' },
];

const root = useTemplateRef('root');
let timeline: Timeline | undefined;

useResizeObserver(root, entries => {
  const height = Math.floor(entries[0]?.contentRect.height ?? 0);
  if (height > 0) timeline?.setOptions({ height });
});

const groups = computed<DataGroup[]>(() =>
  laneDefinitions.map(lane => ({
    className: `trace-group trace-group-${lane.id}`,
    content: lane.label,
    id: lane.id,
  })),
);
const items = computed<DataItem[]>(() =>
  props.steps.map(step => ({
    className: `trace-item trace-item-${step.lane} trace-item-${step.status}`,
    content: '',
    end: new Date(step.completedAt ?? props.end),
    group: step.lane,
    id: step.id,
    start: new Date(step.startedAt),
    title: `${step.name} · ${formatDuration(step.durationMs)}`,
    type: 'range',
  })),
);

onMounted(() => {
  if (!root.value) return;
  const padding = Math.max(3, (props.end - props.start) * 0.025);
  const height = Math.max(80, Math.floor(root.value.clientHeight));
  const options: TimelineOptions = {
    autoResize: true,
    editable: false,
    end: new Date(props.end + padding),
    format: {
      minorLabels: date => formatOffset(Number(date) - props.start),
    },
    groupHeightMode: 'auto',
    groupOrder: (left, right) =>
      laneDefinitions.findIndex(lane => lane.id === left.id) -
      laneDefinitions.findIndex(lane => lane.id === right.id),
    height,
    margin: { axis: 0, item: { horizontal: 0, vertical: 4 } },
    max: new Date(props.end + padding * 12),
    min: new Date(props.start - padding * 12),
    moveable: true,
    orientation: { axis: 'top', item: 'top' },
    selectable: true,
    showCurrentTime: false,
    showMajorLabels: false,
    showMinorLabels: true,
    stack: false,
    start: new Date(props.start),
    verticalScroll: true,
    zoomMax: Math.max(10, (props.end - props.start) * 24),
    zoomKey: 'ctrlKey',
    zoomMin: Math.min(10, Math.max(1, props.end - props.start)),
    zoomable: true,
  };
  timeline = new Timeline(root.value, items.value, groups.value, options);
  const timelineRoot = root.value.querySelector<HTMLElement>('.vis-timeline');
  if (timelineRoot) timelineRoot.style.visibility = 'visible';
  timeline.on('select', properties => {
    const selected = (properties as { items?: readonly (number | string)[] }).items?.[0];
    const step = props.steps.find(candidate => candidate.id === selected);
    if (step) emit('select', step);
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
    const padding = Math.max(3, (end - start) * 0.025);
    timeline?.setOptions({
      end: new Date(end + padding),
      max: new Date(end + padding * 12),
      min: new Date(start - padding * 12),
      start: new Date(start),
    });
  },
);

onBeforeUnmount(() => timeline?.destroy());

function formatDuration(duration?: number): string {
  if (duration === undefined) return 'Running';
  if (duration < 1_000) return `${duration} ms`;
  return `${(duration / 1_000).toFixed(2)} s`;
}

function formatOffset(offsetMs: number): string {
  if (offsetMs < 0) return '';
  if (Math.abs(offsetMs) < 1_000) return `${Math.round(offsetMs)} ms`;
  return `${(offsetMs / 1_000).toFixed(1)} s`;
}
</script>

<template>
  <div
    ref="root"
    class="vigilia-timeline"
    aria-label="执行轨迹时间轴；拖动横向平移，Ctrl 加滚轮缩放，滚轮纵向滚动"
  />
</template>

<style>
.vigilia-timeline {
  height: 100%;
  min-height: 0;
  overflow: hidden;
  background: #202123;
}

.vigilia-timeline .vis-timeline,
.vigilia-timeline .vis-panel,
.vigilia-timeline .vis-labelset .vis-label,
.vigilia-timeline .vis-foreground .vis-group {
  border-color: #2b2c2e !important;
}

.vigilia-timeline .vis-panel.vis-left {
  width: 80px !important;
  border-right-color: #2b2c2e !important;
  background: #202123;
}

.vigilia-timeline .vis-panel.vis-center,
.vigilia-timeline .vis-panel.vis-background,
.vigilia-timeline .vis-panel.vis-top,
.vigilia-timeline .vis-panel.vis-bottom {
  left: 80px !important;
}

.vigilia-timeline .vis-labelset .vis-label,
.vigilia-timeline .vis-foreground .vis-group {
  min-height: 22px;
  box-sizing: border-box;
}

.vigilia-timeline .vis-labelset .vis-label .vis-inner {
  display: flex;
  box-sizing: border-box;
  height: 100%;
  align-items: center;
  padding: 0 14px;
  color: #777a7e;
  font:
    10px/13px SFMono-Regular,
    Consolas,
    monospace;
}

.vigilia-timeline .vis-time-axis {
  background: #252628;
}

.vigilia-timeline .vis-time-axis .vis-text {
  padding-top: 4px;
  color: #777a7e;
  font:
    9px/13px SFMono-Regular,
    Consolas,
    monospace;
}

.vigilia-timeline .vis-panel .vis-grid {
  border-color: #2b2c2e !important;
}

.vigilia-timeline .vis-item.trace-item {
  min-width: 8px;
  height: 10px;
  border: 0;
  border-radius: 1px;
  top: 6px !important;
  cursor: pointer;
}

.vigilia-timeline .vis-item.trace-item .vis-item-content {
  display: none;
}

.vigilia-timeline .vis-item.trace-item-sensory {
  background: #5b8ff9;
}

.vigilia-timeline .vis-item.trace-item-context {
  background: #4fc38b;
}

.vigilia-timeline .vis-item.trace-item-memory {
  background: #42b8c6;
}

.vigilia-timeline .vis-item.trace-item-model {
  background: #a779d2;
}

.vigilia-timeline .vis-item.trace-item-tool {
  background: #f59e42;
}

.vigilia-timeline .vis-item.trace-item-nucleus {
  background: #fb7299;
}

.vigilia-timeline .vis-item.trace-item-running {
  animation: trace-pulse 1.1s ease-in-out infinite;
}

.vigilia-timeline .vis-item.trace-item-failed {
  background: #f05b67;
}

.vigilia-timeline .vis-item.vis-selected {
  outline: 1px solid #fb7299;
  outline-offset: 2px;
}

@keyframes trace-pulse {
  50% {
    opacity: 0.42;
  }
}
</style>
