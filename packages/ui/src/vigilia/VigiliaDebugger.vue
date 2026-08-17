<script setup lang="ts">
import type { AnyVigiliaEvent, VigiliaSnapshot } from '@ciels/core';
import { ChevronRight, CircleAlert, Radio, TimerReset } from '@lucide/vue';
import { computed, shallowRef, watch } from 'vue';

import { Button } from '../components/ui/button/index.ts';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from '../components/ui/dialog/index.ts';
import { buildVigiliaThoughtRuns, type VigiliaStep, type VigiliaStepLane } from './trace.ts';

const props = defineProps<{
  connected?: boolean;
  events: readonly AnyVigiliaEvent[];
  snapshot: VigiliaSnapshot;
}>();

const lanes: readonly { id: VigiliaStepLane; label: string }[] = [
  { id: 'nucleus', label: 'Nucleus' },
  { id: 'memory', label: 'Memory' },
  { id: 'context', label: 'Context' },
  { id: 'model', label: 'Model' },
  { id: 'tool', label: 'Tool' },
  { id: 'sensory', label: 'Sensory' },
];
const selectedRunId = shallowRef('');
const selectedStep = shallowRef<VigiliaStep>();

const runs = computed(() => [...buildVigiliaThoughtRuns(props.events)].reverse());
const selectedRun = computed(
  () => runs.value.find(run => run.id === selectedRunId.value) ?? runs.value[0],
);
const traceEnd = computed(() => {
  const run = selectedRun.value;
  if (!run) return 1;
  return Math.max(
    run.startedAt + 1,
    run.completedAt ?? props.events.at(-1)?.time ?? run.startedAt + 1,
  );
});
const traceDuration = computed(() =>
  Math.max(1, traceEnd.value - (selectedRun.value?.startedAt ?? 0)),
);
const ticks = computed(() => Array.from({ length: 5 }, (_, index) => index / 4));

watch(
  runs,
  value => {
    if (!value.length) {
      selectedRunId.value = '';
      return;
    }
    if (!value.some(run => run.id === selectedRunId.value)) selectedRunId.value = value[0]!.id;
  },
  { immediate: true },
);

function laneSteps(lane: VigiliaStepLane): readonly VigiliaStep[] {
  return selectedRun.value?.steps.filter(step => step.lane === lane) ?? [];
}

function laneHeight(lane: VigiliaStepLane): string {
  return `${Math.max(56, laneSteps(lane).length * 48 + 8)}px`;
}

function barStyle(step: VigiliaStep, index: number): Record<string, string> {
  const start = selectedRun.value?.startedAt ?? step.startedAt;
  const left = ((step.startedAt - start) / traceDuration.value) * 100;
  const end = step.completedAt ?? traceEnd.value;
  const width = Math.max(((end - step.startedAt) / traceDuration.value) * 100, 1.25);
  return {
    left: `${Math.min(99, Math.max(0, left))}%`,
    top: `${8 + index * 48}px`,
    width: `${Math.min(100 - left, width)}%`,
  };
}

function barClass(step: VigiliaStep): string {
  if (step.status === 'failed') return 'border-red-400/50 bg-red-400/15 text-red-200';
  if (step.status === 'running')
    return 'border-amber-300/50 bg-amber-300/15 text-amber-100 animate-pulse';
  if (step.lane === 'model') return 'border-violet-400/50 bg-violet-400/15 text-violet-100';
  if (step.lane === 'tool') return 'border-sky-400/50 bg-sky-400/15 text-sky-100';
  return 'border-emerald-400/40 bg-emerald-400/12 text-emerald-100';
}

function statusClass(step: VigiliaStep): string {
  if (step.status === 'failed') return 'bg-red-400';
  if (step.status === 'running') return 'bg-amber-300';
  return 'bg-emerald-400';
}

function formatClock(time: number): string {
  return new Intl.DateTimeFormat('zh-CN', {
    fractionalSecondDigits: 3,
    hour: '2-digit',
    hour12: false,
    minute: '2-digit',
    second: '2-digit',
  }).format(time);
}

function formatDuration(duration?: number): string {
  if (duration === undefined) return '运行中';
  if (duration < 1_000) return `${duration} ms`;
  return `${(duration / 1_000).toFixed(2)} s`;
}

function pretty(value: unknown): string {
  if (value === undefined) return '未捕获或尚未产生';
  if (typeof value === 'string') return value;
  return JSON.stringify(value, null, 2);
}

function shortId(value: string): string {
  return value.slice(0, 8);
}
</script>

<template>
  <main
    class="min-h-screen bg-[#080a0c] bg-[radial-gradient(circle_at_20%_-10%,rgba(52,211,153,0.12),transparent_30%),linear-gradient(rgba(255,255,255,0.018)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.018)_1px,transparent_1px)] bg-[size:auto,32px_32px,32px_32px] text-zinc-100"
  >
    <div class="mx-auto flex max-w-[1500px] flex-col gap-5 px-5 py-7 sm:px-8 lg:px-11">
      <header class="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p class="mb-2 font-mono text-[10px] tracking-[0.22em] text-emerald-300/60 uppercase">
            Ciel runtime observability
          </p>
          <h1 class="text-3xl font-semibold tracking-[-0.04em]">Vigilia Debugger</h1>
        </div>
        <div class="flex items-center gap-2 font-mono text-xs text-zinc-500">
          <span
            class="size-2 rounded-full"
            :class="props.connected ? 'bg-emerald-400 shadow-[0_0_14px_#34d399]' : 'bg-zinc-700'"
          />
          {{ props.connected ? 'Live journal' : 'Waiting for bridge' }}
        </div>
      </header>

      <section class="overflow-hidden rounded-xl border border-white/8 bg-zinc-950/75 shadow-2xl">
        <div
          class="flex flex-wrap items-center justify-between gap-4 border-b border-white/8 px-5 py-4"
        >
          <div class="flex items-center gap-3">
            <Radio class="size-4 text-emerald-400" />
            <div>
              <h2 class="text-sm font-medium">Execution timeline</h2>
              <p class="mt-0.5 text-xs text-zinc-500">调用开始、耗时与并行关系</p>
            </div>
          </div>
          <select
            v-if="runs.length"
            v-model="selectedRunId"
            class="rounded-md border border-white/10 bg-zinc-950 px-3 py-2 font-mono text-xs text-zinc-300 outline-none focus:ring-2 focus:ring-emerald-400/40"
            aria-label="选择思考轮次"
          >
            <option v-for="run in runs" :key="run.id" :value="run.id">
              {{ formatClock(run.startedAt) }} · {{ run.trigger }} · {{ shortId(run.id) }}
            </option>
          </select>
        </div>

        <div v-if="selectedRun" class="overflow-x-auto">
          <div class="min-w-[760px]">
            <div class="grid grid-cols-[112px_minmax(620px,1fr)] border-b border-white/6">
              <div class="px-4 py-3 font-mono text-[10px] text-zinc-600 uppercase">Lane</div>
              <div class="relative h-10 border-l border-white/6">
                <span
                  v-for="tick in ticks"
                  :key="tick"
                  class="absolute top-3 -translate-x-1/2 font-mono text-[9px] text-zinc-600"
                  :style="{ left: `${tick * 100}%` }"
                >
                  {{ formatDuration(Math.round(traceDuration * tick)) }}
                </span>
              </div>
            </div>
            <div
              v-for="lane in lanes"
              :key="lane.id"
              class="grid grid-cols-[112px_minmax(620px,1fr)] border-b border-white/6 last:border-b-0"
              :style="{ minHeight: laneHeight(lane.id) }"
            >
              <div class="flex items-center px-4 font-mono text-[11px] text-zinc-500">
                {{ lane.label }}
              </div>
              <div
                class="relative border-l border-white/6 bg-[linear-gradient(90deg,rgba(255,255,255,0.045)_1px,transparent_1px)] bg-[size:25%_100%]"
              >
                <button
                  v-for="(step, index) in laneSteps(lane.id)"
                  :key="step.id"
                  type="button"
                  class="absolute flex h-10 min-w-5 items-center overflow-hidden rounded-md border px-2 text-left font-mono text-[10px] whitespace-nowrap shadow-sm transition-[filter,transform] hover:z-10 hover:brightness-125 focus-visible:z-10 focus-visible:ring-2 focus-visible:ring-emerald-300/60 focus-visible:outline-none"
                  :class="barClass(step)"
                  :style="barStyle(step, index)"
                  :title="`${step.name} · ${formatDuration(step.durationMs)}`"
                  @click="selectedStep = step"
                >
                  <span class="truncate">{{ step.name }}</span>
                </button>
              </div>
            </div>
          </div>
        </div>
        <div v-else class="grid min-h-72 place-items-center px-6 text-center text-sm text-zinc-600">
          等待第一次 Nucleus think
        </div>
      </section>

      <section class="overflow-hidden rounded-xl border border-white/8 bg-zinc-950/75 shadow-2xl">
        <div
          class="flex flex-wrap items-center justify-between gap-3 border-b border-white/8 px-5 py-4"
        >
          <div>
            <h2 class="text-sm font-medium">Execution steps</h2>
            <p class="mt-1 text-xs text-zinc-500">点击任意步骤查看输入、输出与原始事件</p>
          </div>
          <div class="flex items-center gap-4 font-mono text-[10px] text-zinc-600">
            <span>{{ selectedRun?.steps.length ?? 0 }} steps</span>
            <span>#{{ props.snapshot.throughSequence }}</span>
          </div>
        </div>

        <div v-if="selectedRun?.steps.length" class="divide-y divide-white/6">
          <Button
            v-for="(step, index) in selectedRun.steps"
            :key="step.id"
            variant="ghost"
            class="grid h-auto w-full grid-cols-[40px_minmax(0,1fr)_90px_90px_24px] justify-normal rounded-none px-5 py-3.5 text-left hover:bg-white/[0.035]"
            @click="selectedStep = step"
          >
            <span class="font-mono text-[10px] text-zinc-700">
              {{ String(index + 1).padStart(2, '0') }}
            </span>
            <span class="min-w-0">
              <span class="flex items-center gap-2">
                <span class="size-1.5 shrink-0 rounded-full" :class="statusClass(step)" />
                <strong class="truncate font-mono text-xs font-medium text-zinc-200">
                  {{ step.name }}
                </strong>
              </span>
              <span class="mt-1 block truncate pl-3.5 font-mono text-[9px] text-zinc-600">
                {{ step.id }}
              </span>
            </span>
            <span class="font-mono text-[10px] text-zinc-500 capitalize">{{ step.lane }}</span>
            <span class="text-right font-mono text-[10px] text-zinc-400">
              {{ formatDuration(step.durationMs) }}
            </span>
            <ChevronRight class="size-4 text-zinc-700" />
          </Button>
        </div>
        <div v-else class="px-5 py-16 text-center text-sm text-zinc-600">暂无执行步骤</div>
      </section>
    </div>

    <Dialog
      :open="selectedStep !== undefined"
      @update:open="open => !open && (selectedStep = undefined)"
    >
      <DialogContent>
        <div v-if="selectedStep" class="flex max-h-[88vh] flex-col overflow-hidden">
          <div class="border-b border-white/8 px-6 py-5 pr-14">
            <DialogTitle class="flex items-center gap-3">
              <span class="size-2 rounded-full" :class="statusClass(selectedStep)" />
              {{ selectedStep.name }}
            </DialogTitle>
            <DialogDescription class="mt-2 font-mono text-xs">
              {{ selectedStep.lane }} · {{ selectedStep.status }} · {{ selectedStep.id }}
            </DialogDescription>
          </div>

          <div class="overflow-y-auto px-6 py-5">
            <div class="mb-5 grid gap-3 sm:grid-cols-3">
              <div class="rounded-lg border border-white/8 bg-white/[0.025] p-3">
                <span class="flex items-center gap-2 text-[10px] text-zinc-600 uppercase">
                  <TimerReset class="size-3" /> Duration
                </span>
                <strong class="mt-2 block font-mono text-sm font-medium">
                  {{ formatDuration(selectedStep.durationMs) }}
                </strong>
              </div>
              <div class="rounded-lg border border-white/8 bg-white/[0.025] p-3">
                <span class="text-[10px] text-zinc-600 uppercase">Started at</span>
                <strong class="mt-2 block font-mono text-sm font-medium">
                  {{ formatClock(selectedStep.startedAt) }}
                </strong>
              </div>
              <div class="rounded-lg border border-white/8 bg-white/[0.025] p-3">
                <span class="text-[10px] text-zinc-600 uppercase">Parent operation</span>
                <strong class="mt-2 block truncate font-mono text-sm font-medium">
                  {{ selectedStep.parentId ?? '—' }}
                </strong>
              </div>
            </div>

            <div class="grid gap-4 lg:grid-cols-2">
              <section class="min-w-0 rounded-lg border border-white/8 bg-black/25">
                <h3 class="border-b border-white/8 px-4 py-3 text-xs font-medium text-zinc-400">
                  Input / detail
                </h3>
                <pre
                  class="max-h-80 overflow-auto p-4 font-mono text-[11px] leading-5 text-zinc-400"
                  >{{ pretty(selectedStep.input) }}</pre>
              </section>
              <section class="min-w-0 rounded-lg border border-white/8 bg-black/25">
                <h3 class="border-b border-white/8 px-4 py-3 text-xs font-medium text-zinc-400">
                  Output / error
                </h3>
                <pre
                  class="max-h-80 overflow-auto p-4 font-mono text-[11px] leading-5 text-zinc-400"
                  >{{ pretty(selectedStep.output) }}</pre>
              </section>
            </div>

            <section class="mt-4 min-w-0 rounded-lg border border-white/8 bg-black/25">
              <h3
                class="flex items-center gap-2 border-b border-white/8 px-4 py-3 text-xs font-medium text-zinc-400"
              >
                <CircleAlert class="size-3.5" /> Raw Vigilia events
              </h3>
              <pre
                class="max-h-72 overflow-auto p-4 font-mono text-[11px] leading-5 text-zinc-500"
                >{{ pretty(selectedStep.events) }}</pre>
            </section>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  </main>
</template>
