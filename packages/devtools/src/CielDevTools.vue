<script setup lang="ts">
import type { AnyVigiliaEvent, VigiliaSnapshot } from '@ciels/core';
import {
  CircleDot,
  Clock3,
  Download,
  MessageSquareText,
  PanelRightClose,
  PanelRightOpen,
  Rows3,
  Search,
  Wrench,
} from '@lucide/vue';
import { computed, defineAsyncComponent, ref, shallowRef, watch } from 'vue';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from '@/components/ui/resizable';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { buildVigiliaThoughtRuns, type VigiliaStep, type VigiliaStepLane } from '@/lib/trace';

import TraceInspector from './components/devtools/TraceInspector.vue';

const TraceTimeline = defineAsyncComponent(() => import('@/components/devtools/TraceTimeline.vue'));

const props = defineProps<{
  connected?: boolean;
  events: readonly AnyVigiliaEvent[];
  snapshot: VigiliaSnapshot;
}>();

const slots = defineSlots<{
  'header-actions'?: () => unknown;
  'title-extra'?: () => unknown;
}>();

type ViewTab = 'conversation' | 'trace';

const viewTab = shallowRef<ViewTab>('trace');
const selectedRunId = shallowRef('');
const selectedStepId = shallowRef('');
const inspectorOpen = ref(true);
const search = ref('');

const runs = computed(() => [...buildVigiliaThoughtRuns(props.events)].reverse());
const selectedRun = computed(
  () => runs.value.find(run => run.id === selectedRunId.value) ?? runs.value[0],
);
const selectedStep = computed(
  () =>
    selectedRun.value?.steps.find(step => step.id === selectedStepId.value) ??
    selectedRun.value?.steps[0],
);
const filteredSteps = computed(() => {
  const steps = selectedRun.value?.steps ?? [];
  const query = search.value.trim().toLocaleLowerCase();
  if (!query) return steps;
  return steps.filter(step =>
    [step.name, step.lane, step.status, pretty(step.input), pretty(step.output)]
      .join(' ')
      .toLocaleLowerCase()
      .includes(query),
  );
});
const traceEnd = computed(() => {
  const run = selectedRun.value;
  if (!run) return 1;
  return Math.max(
    run.startedAt + 1,
    run.completedAt ?? props.events.at(-1)?.time ?? run.startedAt + 1,
  );
});
const title = computed(() => {
  const percept = selectedRun.value?.inputPercepts.at(-1);
  return percept ? truncate(displayText(percept.content), 66) : 'Ciel runtime';
});

watch(
  runs,
  value => {
    if (!value.length) {
      selectedRunId.value = '';
      selectedStepId.value = '';
      return;
    }
    if (!value.some(run => run.id === selectedRunId.value)) selectedRunId.value = value[0]!.id;
  },
  { immediate: true },
);

watch(
  selectedRun,
  run => {
    if (!run) return;
    if (!run.steps.some(step => step.id === selectedStepId.value)) {
      selectedStepId.value = run.steps[0]?.id ?? '';
    }
  },
  { immediate: true },
);

function selectStep(step: VigiliaStep): void {
  selectedStepId.value = step.id;
  inspectorOpen.value = true;
}

function laneSteps(lane: VigiliaStepLane): readonly VigiliaStep[] {
  return selectedRun.value?.steps.filter(step => step.lane === lane) ?? [];
}

function laneClass(lane: VigiliaStepLane): string {
  return {
    context: 'lane-context',
    memory: 'lane-memory',
    model: 'lane-model',
    nucleus: 'lane-nucleus',
    sensory: 'lane-sensory',
    tool: 'lane-tool',
  }[lane];
}

function displayText(value: unknown): string {
  if (typeof value === 'string') return value;
  if (value && typeof value === 'object' && 'text' in value) {
    const text = (value as { text?: unknown }).text;
    if (typeof text === 'string') return text;
  }
  return pretty(value);
}

function pretty(value: unknown): string {
  if (value === undefined) return 'No captured data';
  if (typeof value === 'string') return value;
  return JSON.stringify(value, null, 2);
}

function preview(step: VigiliaStep): string {
  return truncate(pretty(step.output ?? step.input).replaceAll(/\s+/g, ' '), 160);
}

function truncate(value: string, length: number): string {
  return value.length > length ? `${value.slice(0, length)}…` : value;
}

function shortId(value: string): string {
  return value.slice(0, 8);
}

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
  if (duration < 1_000) return `${duration} ms`;
  return `${(duration / 1_000).toFixed(2)} s`;
}

function exportTrace(): void {
  const run = selectedRun.value;
  if (!run) return;
  const blob = new Blob([pretty(run)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = `ciel-trace-${shortId(run.id)}.json`;
  anchor.click();
  URL.revokeObjectURL(url);
}
</script>

<template>
  <Tabs
    v-model="viewTab"
    class="flex h-dvh min-h-[620px] flex-col gap-0 overflow-hidden bg-[#171819] text-[#d8d8da]"
  >
    <header class="flex h-16 shrink-0 flex-col border-b border-[#343537] bg-[#1c1d1e]">
      <div
        class="flex h-9 min-w-0 shrink-0 items-center border-b border-white/[0.07] px-3 py-2 sm:px-4"
      >
        <div class="flex min-w-0 flex-1 items-center gap-3">
          <h1 class="truncate text-[14px] font-medium tracking-[-0.005em] text-[#eeeeef]">
            {{ title }}
          </h1>
          <slot name="title-extra" />
        </div>
        <div v-if="slots['header-actions']" class="flex shrink-0 items-center gap-3">
          <slot name="header-actions" />
        </div>
      </div>
      <TabsList
        class="h-7 justify-start gap-6 rounded-none bg-transparent px-3 py-0 sm:px-4"
        aria-label="调试视图"
      >
        <TabsTrigger
          value="conversation"
          class="h-full rounded-none border-x-0 border-t-0 border-b-2 border-transparent bg-transparent! px-0 text-xs text-zinc-400 shadow-none data-[state=active]:border-[#FB7299] data-[state=active]:bg-transparent! data-[state=active]:text-[#FB7299] data-[state=active]:shadow-none dark:data-[state=active]:bg-transparent!"
        >
          对话
        </TabsTrigger>
        <TabsTrigger
          value="trace"
          class="h-full rounded-none border-x-0 border-t-0 border-b-2 border-transparent bg-transparent! px-0 text-xs text-zinc-400 shadow-none data-[state=active]:border-[#FB7299] data-[state=active]:bg-transparent! data-[state=active]:text-[#FB7299] data-[state=active]:shadow-none dark:data-[state=active]:bg-transparent!"
        >
          轨迹
        </TabsTrigger>
      </TabsList>
    </header>

    <TabsContent value="conversation" class="mt-0 min-h-0 flex-1 overflow-hidden">
      <ScrollArea class="h-full bg-[#1c1d1e]">
        <template v-if="selectedRun">
          <div
            class="flex h-7 items-center border-b border-white/[0.07] bg-[#18191a] px-4 font-mono text-[9px] text-zinc-600"
          >
            Conversation · {{ shortId(selectedRun.id) }} · {{ formatClock(selectedRun.startedAt) }}
          </div>
          <article
            v-for="percept in selectedRun.inputPercepts"
            :key="percept.sequence"
            class="grid grid-cols-[86px_minmax(0,1fr)] border-b border-white/[0.07]"
          >
            <div class="flex justify-end px-3 py-4">
              <Badge class="h-fit border-0 bg-[#5B8FF9]/20 font-mono text-[10px] text-[#7EABFF]"
                >ASR</Badge
              >
            </div>
            <div class="min-w-0 py-4 pr-6">
              <p class="text-[14px] leading-6 whitespace-pre-wrap text-zinc-100">
                {{ displayText(percept.content) }}
              </p>
              <p class="mt-2 font-mono text-[10px] text-zinc-600">
                {{ percept.perceptType }} · {{ percept.stimulus }} / {{ percept.signal }} ·
                {{ formatClock(percept.time) }}
              </p>
            </div>
          </article>
          <article
            v-if="selectedRun.output !== undefined"
            class="grid grid-cols-[86px_minmax(0,1fr)] border-b border-white/[0.07]"
          >
            <div class="flex justify-end px-3 py-4">
              <Badge class="h-fit border-0 bg-[#A779D2]/20 font-mono text-[10px] text-[#C59BE8]"
                >MODEL</Badge
              >
            </div>
            <div class="min-w-0 py-4 pr-6">
              <p class="text-[14px] leading-6 whitespace-pre-wrap text-zinc-100">
                {{ displayText(selectedRun.output) }}
              </p>
              <p class="mt-2 font-mono text-[10px] text-zinc-600">
                Final response · {{ formatClock(selectedRun.completedAt) }} ·
                {{ formatDuration(selectedRun.durationMs) }}
              </p>
            </div>
          </article>
        </template>
        <div v-else class="grid h-full place-items-center px-6 text-center">
          <div>
            <MessageSquareText class="mx-auto size-7 text-zinc-700" />
            <p class="mt-3 text-sm text-zinc-500">等待 ASR 或文本输入开始一段对话</p>
          </div>
        </div>
      </ScrollArea>
    </TabsContent>

    <TabsContent value="trace" class="mt-0 flex min-h-0 flex-1 flex-col overflow-hidden">
      <section
        class="flex h-8 shrink-0 items-center gap-1 border-b border-white/10 bg-[#202122] px-2 text-[11px] text-zinc-400"
      >
        <span class="flex h-full items-center gap-1.5 px-2">
          <Clock3 class="size-3.5" /> {{ formatDuration(selectedRun?.durationMs) }}
        </span>
        <span class="flex h-full items-center gap-1.5 px-2">
          <Rows3 class="size-3.5" /> {{ selectedRun?.steps.length ?? 0 }} Steps
        </span>
        <span class="hidden h-full items-center gap-1.5 px-2 sm:flex">
          <Wrench class="size-3.5" /> {{ laneSteps('tool').length }} Calls
        </span>
        <Separator orientation="vertical" class="mx-1 h-4 bg-white/10" />
        <Button
          variant="ghost"
          size="xs"
          class="h-5 gap-1 px-1.5 text-[10px] text-zinc-400 hover:bg-white/5 hover:text-zinc-100"
          @click="exportTrace"
        >
          <Download class="size-3" /> Export
        </Button>
        <label class="relative ml-auto hidden sm:block">
          <Search
            class="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-zinc-600"
          />
          <Input
            v-model="search"
            type="search"
            placeholder="搜索步骤"
            class="h-6 w-48 border-transparent bg-white/[0.045] pr-2 pl-8 text-[11px] text-zinc-200 shadow-none placeholder:text-zinc-600 focus-visible:border-transparent focus-visible:ring-[#FB7299]/25 md:text-[11px] lg:w-56"
          />
        </label>
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger as-child>
              <Button
                variant="ghost"
                size="icon-sm"
                class="ml-1 size-6 border-0 bg-transparent text-zinc-500 shadow-none hover:bg-white/5 hover:text-zinc-200"
                :aria-label="inspectorOpen ? '隐藏检查器' : '显示检查器'"
                @click="inspectorOpen = !inspectorOpen"
              >
                <PanelRightClose v-if="inspectorOpen" class="size-4" />
                <PanelRightOpen v-else class="size-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>{{ inspectorOpen ? '隐藏检查器' : '显示检查器' }}</TooltipContent>
          </Tooltip>
        </TooltipProvider>
      </section>

      <ResizablePanelGroup direction="vertical" class="min-h-0 flex-1">
        <ResizablePanel :default-size="34" :min-size="18" :max-size="60">
          <TraceTimeline
            v-if="selectedRun"
            :end="traceEnd"
            :selected-id="selectedStep?.id"
            :start="selectedRun.startedAt"
            :steps="selectedRun.steps"
            @select="selectStep"
          />
          <div
            v-else
            class="grid h-full place-items-center border-b border-white/10 bg-[#292a2b] text-xs text-zinc-600"
          >
            Waiting for the first trace
          </div>
        </ResizablePanel>

        <ResizableHandle with-handle class="h-px bg-white/10 hover:bg-[#FB7299]/70" />

        <ResizablePanel :default-size="66" :min-size="30">
          <ResizablePanelGroup direction="horizontal" class="min-h-0">
            <ResizablePanel :default-size="inspectorOpen ? 62 : 100" :min-size="35">
              <ScrollArea class="h-full bg-[#1c1d1e]">
                <div
                  v-if="selectedRun"
                  class="flex h-6 items-center border-b border-white/[0.06] bg-[#18191a] px-2 font-mono text-[9px] text-zinc-600"
                >
                  Trace · {{ shortId(selectedRun.id) }}
                </div>
                <button
                  v-for="step in filteredSteps"
                  :key="step.id"
                  type="button"
                  class="group grid w-full grid-cols-[26px_68px_minmax(0,1fr)_76px] items-center border-b border-white/[0.07] text-left transition hover:bg-white/[0.035]"
                  :class="
                    selectedStep?.id === step.id
                      ? 'border-l-[3px] border-l-[#FB7299] bg-white/[0.045]'
                      : 'border-l-[3px] border-l-transparent'
                  "
                  @click="selectStep(step)"
                >
                  <span class="flex justify-center">
                    <CircleDot
                      class="size-2.5"
                      :class="
                        step.status === 'failed'
                          ? 'text-red-400'
                          : step.status === 'running'
                            ? 'text-amber-400'
                            : 'text-zinc-600'
                      "
                    />
                  </span>
                  <span class="py-1.5">
                    <Badge
                      class="inline-flex rounded px-1.5 py-0.5 font-mono text-[9px] font-semibold tracking-wide uppercase"
                      :class="laneClass(step.lane)"
                    >
                      {{ step.lane }}
                    </Badge>
                  </span>
                  <span class="flex min-w-0 items-baseline gap-3 py-2 pr-3">
                    <strong class="shrink-0 font-mono text-[12px] font-normal text-zinc-200">{{
                      step.name
                    }}</strong>
                    <span class="truncate font-mono text-[11px] text-zinc-500">{{
                      preview(step)
                    }}</span>
                  </span>
                  <span class="pr-3 text-right font-mono text-[10px] text-zinc-600">{{
                    formatDuration(step.durationMs)
                  }}</span>
                </button>

                <div
                  v-if="selectedRun && !filteredSteps.length"
                  class="px-6 py-14 text-center text-xs text-zinc-600"
                >
                  没有匹配的步骤
                </div>
                <div
                  v-if="!selectedRun"
                  class="grid h-full min-h-60 place-items-center text-sm text-zinc-600"
                >
                  等待执行轨迹
                </div>
              </ScrollArea>
            </ResizablePanel>

            <ResizableHandle
              v-if="inspectorOpen"
              with-handle
              class="w-px bg-white/10 hover:bg-[#FB7299]/70"
            />
            <ResizablePanel v-if="inspectorOpen" :default-size="38" :min-size="25">
              <TraceInspector :step="selectedStep" @close="inspectorOpen = false" />
            </ResizablePanel>
          </ResizablePanelGroup>
        </ResizablePanel>
      </ResizablePanelGroup>
    </TabsContent>
  </Tabs>
</template>

<style scoped>
.lane-sensory {
  background: rgb(91 143 249 / 0.18);
  color: #7eabff;
}

.lane-context {
  background: rgb(79 195 139 / 0.18);
  color: #72d7a5;
}

.lane-memory {
  background: rgb(66 184 198 / 0.18);
  color: #65cbd8;
}

.lane-model {
  background: rgb(167 121 210 / 0.2);
  color: #c59be8;
}

.lane-tool {
  background: rgb(245 158 66 / 0.18);
  color: #ffb160;
}

.lane-nucleus {
  background: rgb(251 114 153 / 0.18);
  color: #ff8eb0;
}

.console-scrollbar {
  scrollbar-color: #4b4d50 #202122;
  scrollbar-width: thin;
}
</style>
