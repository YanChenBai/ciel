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
import { useVirtualList } from '@vueuse/core';
import { computed, defineAsyncComponent, nextTick, ref, shallowRef, watch } from 'vue';
import type { ObjectDirective } from 'vue';

import ObjectInspector from '@/components/devtools/ObjectInspector.vue';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from '@/components/ui/resizable';
import { Separator } from '@/components/ui/separator';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { resolveAssetUrl } from '@/lib/assets';
import {
  buildVigiliaConversationEntries,
  buildVigiliaSignalSteps,
  buildVigiliaThoughtRuns,
  type VigiliaStep,
  type VigiliaStepLane,
} from '@/lib/trace';

import TraceInspector from './components/devtools/TraceInspector.vue';

const TraceTimeline = defineAsyncComponent(() => import('@/components/devtools/TraceTimeline.vue'));

const props = defineProps<{
  assetBaseUrl?: string;
  connected?: boolean;
  events: readonly AnyVigiliaEvent[];
  snapshot: VigiliaSnapshot;
}>();

type ViewTab = 'conversation' | 'trace';
interface StepListItem {
  readonly preview: string;
  readonly searchText: string;
  readonly step: VigiliaStep;
}
interface ConversationListItem {
  readonly entry: ReturnType<typeof buildVigiliaConversationEntries>[number];
  readonly imageUrl?: string;
  readonly structured: boolean;
  readonly text: string;
}

const viewTab = shallowRef<ViewTab>('trace');
const selectedStepId = shallowRef('');
const inspectorOpen = ref(true);
const search = ref('');
const conversationHovered = ref(false);
const conversationHeights = shallowRef<ReadonlyMap<string, number>>(new Map());
const conversationObservers = new WeakMap<HTMLElement, ResizeObserver>();

const chronologicalRuns = computed(() => buildVigiliaThoughtRuns(props.events));
const runs = computed(() => [...chronologicalRuns.value].reverse());
const conversationEntries = computed(() => buildVigiliaConversationEntries(props.events));
const conversationListItems = computed<readonly ConversationListItem[]>(() =>
  conversationEntries.value.map(entry => ({
    entry,
    ...(entry.kind === 'visual'
      ? { imageUrl: resolveAssetUrl(props.assetBaseUrl, entry.content) }
      : {}),
    structured:
      entry.kind === 'model' && entry.content !== null && typeof entry.content === 'object',
    text: displayText(entry.content),
  })),
);
const {
  containerProps: conversationContainerProps,
  list: virtualConversationItems,
  scrollTo: scrollConversationTo,
  wrapperProps: conversationWrapperProps,
} = useVirtualList(conversationListItems, {
  itemHeight: index => conversationItemHeight(index),
  overscan: 5,
});
const selectedRun = computed(() => runs.value[0]);
const visibleSteps = computed(() =>
  [
    ...chronologicalRuns.value.flatMap(run => run.steps.filter(shouldShowStep)),
    ...buildVigiliaSignalSteps(props.events),
  ].sort((left, right) => left.startedAt - right.startedAt),
);
const selectedStep = computed(
  () => visibleSteps.value.find(step => step.id === selectedStepId.value) ?? visibleSteps.value[0],
);
const stepListItems = computed(() => visibleSteps.value.map(createStepListItem));
const filteredStepItems = computed(() => {
  const items = stepListItems.value;
  const query = search.value.trim().toLocaleLowerCase();
  if (!query) return items;
  return items.filter(item => item.searchText.includes(query));
});
const {
  containerProps: stepContainerProps,
  list: virtualStepItems,
  wrapperProps: stepWrapperProps,
} = useVirtualList(filteredStepItems, {
  itemHeight: 40,
  overscan: 12,
});
const traceEnd = computed(() => {
  const step = visibleSteps.value.at(-1);
  if (!step) return 1;
  return Math.max(
    step.startedAt + 1,
    step.completedAt ?? props.events.at(-1)?.time ?? step.startedAt + 1,
  );
});
const traceStart = computed(() => visibleSteps.value[0]?.startedAt ?? traceEnd.value - 1);
watch(
  [() => conversationListItems.value.length, viewTab],
  async ([length, tab]) => {
    if (!length || tab !== 'conversation' || conversationHovered.value) return;
    await nextTick();
    scrollConversationToEnd();
  },
  { flush: 'post', immediate: true },
);

function scrollConversationToEnd(): void {
  const lastIndex = conversationListItems.value.length - 1;
  if (lastIndex >= 0) scrollConversationTo(lastIndex, { block: 'end' });
}

function resumeConversationAutoScroll(): void {
  conversationHovered.value = false;
  scrollConversationToEnd();
}

function conversationItemHeight(index: number): number {
  const item = conversationListItems.value[index];
  if (!item) return 104;
  return conversationHeights.value.get(item.entry.id) ?? estimateConversationHeight(item);
}

function estimateConversationHeight(item: ConversationListItem): number {
  if (item.imageUrl || item.structured) return 260;
  return Math.max(104, 80 + Math.ceil(item.text.length / 72) * 24);
}

function setConversationHeight(id: string, height: number): void {
  const measured = Math.ceil(height);
  if (conversationHeights.value.get(id) === measured) return;
  conversationHeights.value = new Map(conversationHeights.value).set(id, measured);
  if (!conversationHovered.value && viewTab.value === 'conversation') {
    void nextTick(scrollConversationToEnd);
  }
}

const vMeasureConversation: ObjectDirective<HTMLElement, string> = {
  mounted(element, binding) {
    const observer = new ResizeObserver(entries => {
      const height =
        entries[0]?.borderBoxSize[0]?.blockSize ?? element.getBoundingClientRect().height;
      setConversationHeight(binding.value, height);
    });
    observer.observe(element);
    conversationObservers.set(element, observer);
  },
  unmounted(element) {
    conversationObservers.get(element)?.disconnect();
    conversationObservers.delete(element);
  },
};

function conversationBadgeClass(kind: string): string {
  if (kind === 'model') return 'lane-model';
  if (kind === 'visual') return 'lane-vision';
  if (kind === 'danmaku') return 'lane-tool';
  return 'lane-asr';
}

function shouldShowStep(step: VigiliaStep): boolean {
  if (step.lane === 'nucleus') return false;
  if (step.lane === 'sensory') return false;
  if (step.lane === 'memory' && step.output === '') return false;
  return true;
}

watch(
  visibleSteps,
  steps => {
    if (!steps.length) {
      selectedStepId.value = '';
      return;
    }
    if (!steps.some(step => step.id === selectedStepId.value)) {
      selectedStepId.value = steps[0]?.id ?? '';
    }
  },
  { immediate: true },
);

function selectStep(step: VigiliaStep): void {
  selectedStepId.value = step.id;
  inspectorOpen.value = true;
}

function laneSteps(lane: VigiliaStepLane): readonly VigiliaStep[] {
  return visibleSteps.value.filter(step => step.lane === lane);
}

function laneClass(lane: VigiliaStepLane): string {
  return {
    context: 'lane-context',
    asr: 'lane-asr',
    memory: 'lane-memory',
    model: 'lane-model',
    nucleus: 'lane-nucleus',
    sensory: 'lane-sensory',
    tool: 'lane-tool',
    vision: 'lane-vision',
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

function createStepListItem(step: VigiliaStep): StepListItem {
  const preview = previewValue(step.output ?? step.input);
  return {
    preview,
    searchText: [step.name, step.label, step.lane, step.status, preview]
      .join(' ')
      .toLocaleLowerCase(),
    step,
  };
}

function previewValue(value: unknown): string {
  if (value === undefined) return 'No captured data';
  if (typeof value === 'string') return truncate(value.replaceAll(/\s+/g, ' '), 160);
  const serialized = JSON.stringify(compactPreviewValue(value));
  return typeof serialized === 'string'
    ? truncate(serialized.replaceAll(/\s+/g, ' '), 160)
    : String(value);
}

function compactPreviewValue(value: unknown, depth = 0): unknown {
  if (typeof value === 'string') return truncate(value, 160);
  if (value === null || typeof value !== 'object') return value;
  if (depth >= 2) return Array.isArray(value) ? `[${value.length} items]` : '{…}';
  if (Array.isArray(value)) {
    const entries = value.slice(0, 6).map(entry => compactPreviewValue(entry, depth + 1));
    return value.length > entries.length
      ? [...entries, `… ${value.length - entries.length} more`]
      : entries;
  }
  const entries = Object.entries(value).slice(0, 6);
  const compact = Object.fromEntries(
    entries.map(([key, entry]) => [key, compactPreviewValue(entry, depth + 1)]),
  );
  if (Object.keys(value).length > entries.length) compact['…'] = 'more fields';
  return compact;
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
  if (!chronologicalRuns.value.length) return;
  const blob = new Blob([pretty(chronologicalRuns.value)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = `ciel-trace-${Date.now()}.json`;
  anchor.click();
  URL.revokeObjectURL(url);
}
</script>

<template>
  <Tabs
    v-model="viewTab"
    class="ciel-devtools cl:flex cl:h-full cl:min-h-0 cl:flex-col cl:gap-0 cl:overflow-hidden cl:bg-[#171819] cl:text-[#d8d8da]"
  >
    <TabsList
      class="cl:h-8 cl:w-full cl:shrink-0 cl:justify-start cl:gap-6 cl:rounded-none cl:border-b cl:border-[#343537] cl:bg-transparent cl:px-3 cl:py-0 cl:sm:px-4"
      aria-label="调试视图"
    >
      <TabsTrigger value="conversation" class="devtools-view-tab"> 对话 </TabsTrigger>
      <TabsTrigger value="trace" class="devtools-view-tab"> 轨迹 </TabsTrigger>
    </TabsList>

    <TabsContent value="conversation" class="cl:mt-0 cl:min-h-0 cl:flex-1 cl:overflow-hidden">
      <div
        v-if="conversationListItems.length"
        v-bind="conversationContainerProps"
        class="cl:h-full cl:overflow-y-auto cl:bg-[#1c1d1e]"
        @mouseenter="conversationHovered = true"
        @mouseleave="resumeConversationAutoScroll"
      >
        <div v-bind="conversationWrapperProps">
          <article
            v-for="item in virtualConversationItems"
            :key="item.data.entry.id"
            v-measure-conversation="item.data.entry.id"
            class="cl:grid cl:min-h-24 cl:grid-cols-[86px_minmax(0,1fr)] cl:border-b cl:border-white/7"
          >
            <div class="cl:flex cl:justify-end cl:px-3 cl:py-5">
              <Badge
                class="cl:h-fit cl:border-0 cl:font-mono cl:text-[10px]"
                :class="conversationBadgeClass(item.data.entry.kind)"
              >
                {{ item.data.entry.label }}
              </Badge>
            </div>
            <div class="cl:min-w-0 cl:py-5 cl:pr-6">
              <a
                v-if="item.data.imageUrl"
                :href="item.data.imageUrl"
                target="_blank"
                rel="noreferrer"
                class="cl:inline-flex cl:max-w-[50%] cl:rounded-md cl:border cl:border-white/10 cl:bg-black/20 cl:p-1"
              >
                <img
                  :src="item.data.imageUrl"
                  alt="Vision capture"
                  loading="lazy"
                  decoding="async"
                  class="cl:max-h-72 cl:max-w-full cl:rounded cl:object-contain"
                />
              </a>
              <div
                v-else-if="item.data.structured"
                class="cl:max-h-[32rem] cl:overflow-auto cl:rounded cl:px-2 cl:py-1"
              >
                <ObjectInspector :value="item.data.entry.content" :deep="2" />
              </div>
              <p
                v-else
                class="cl:text-[14px] cl:leading-6 cl:whitespace-pre-wrap cl:break-words cl:text-zinc-100"
              >
                {{ item.data.text }}
              </p>
              <p class="cl:mt-2 cl:font-mono cl:text-[10px] cl:text-zinc-600">
                {{ item.data.entry.metadata }} · {{ formatClock(item.data.entry.time) }}
              </p>
            </div>
          </article>
        </div>
      </div>
      <div
        v-else
        class="cl:grid cl:h-full cl:place-items-center cl:bg-[#1c1d1e] cl:px-6 cl:text-center"
      >
        <div>
          <MessageSquareText class="cl:mx-auto cl:size-7 cl:text-zinc-700" />
          <p class="cl:mt-3 cl:text-sm cl:text-zinc-500">等待 ASR、画面或文本感知</p>
        </div>
      </div>
    </TabsContent>

    <TabsContent
      value="trace"
      class="cl:mt-0 cl:flex cl:min-h-0 cl:flex-1 cl:flex-col cl:overflow-hidden"
    >
      <section
        class="cl:flex cl:h-8 cl:shrink-0 cl:items-center cl:gap-1 cl:border-b cl:border-white/10 cl:bg-[#202122] cl:px-2 cl:text-[11px] cl:text-zinc-400"
      >
        <span class="cl:flex cl:h-full cl:items-center cl:gap-1.5 cl:px-2">
          <Clock3 class="cl:size-3.5" /> {{ formatDuration(traceEnd - traceStart) }}
        </span>
        <span class="cl:flex cl:h-full cl:items-center cl:gap-1.5 cl:px-2">
          <Rows3 class="cl:size-3.5" /> {{ visibleSteps.length }} Steps
        </span>
        <span class="cl:hidden cl:h-full cl:items-center cl:gap-1.5 cl:px-2 cl:sm:flex">
          <Wrench class="cl:size-3.5" /> {{ laneSteps('tool').length }} Calls
        </span>
        <Separator orientation="vertical" class="cl:mx-1 cl:h-4 cl:bg-white/10" />
        <Button
          variant="ghost"
          size="xs"
          class="cl:h-5 cl:gap-1 cl:px-1.5 cl:text-[10px] cl:text-zinc-400 cl:hover:bg-white/5 cl:hover:text-zinc-100"
          @click="exportTrace"
        >
          <Download class="cl:size-3" /> Export
        </Button>
        <label class="cl:relative cl:ml-auto cl:hidden cl:sm:block">
          <Search
            class="cl:pointer-events-none cl:absolute cl:top-1/2 cl:left-2.5 cl:size-3.5 cl:-translate-y-1/2 cl:text-zinc-600"
          />
          <Input
            v-model="search"
            type="search"
            placeholder="搜索步骤"
            class="cl:focus-visible:ring-primary/25 cl:h-6 cl:w-48 cl:border-transparent cl:bg-white/4.5 cl:pr-2 cl:pl-8 cl:text-[11px] cl:text-zinc-200 cl:shadow-none cl:placeholder:text-zinc-600 cl:focus-visible:border-transparent cl:md:text-[11px] cl:lg:w-56"
          />
        </label>
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger as-child>
              <Button
                variant="ghost"
                size="icon-sm"
                class="cl:ml-1 cl:size-6 cl:border-0 cl:bg-transparent cl:text-zinc-500 cl:shadow-none cl:hover:bg-white/5 cl:hover:text-zinc-200"
                :aria-label="inspectorOpen ? '隐藏检查器' : '显示检查器'"
                @click="inspectorOpen = !inspectorOpen"
              >
                <PanelRightClose v-if="inspectorOpen" class="cl:size-4" />
                <PanelRightOpen v-else class="cl:size-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>{{ inspectorOpen ? '隐藏检查器' : '显示检查器' }}</TooltipContent>
          </Tooltip>
        </TooltipProvider>
      </section>

      <ResizablePanelGroup direction="vertical" class="cl:min-h-0 cl:flex-1">
        <ResizablePanel :default-size="34" :min-size="18" :max-size="60">
          <TraceTimeline
            v-if="visibleSteps.length"
            :end="traceEnd"
            :selected-id="selectedStep?.id"
            :start="traceStart"
            :steps="visibleSteps"
            @select="selectStep"
          />
          <div
            v-else
            class="cl:grid cl:h-full cl:place-items-center cl:border-b cl:border-white/10 cl:bg-[#292a2b] cl:text-xs cl:text-zinc-600"
          >
            Waiting for the first trace
          </div>
        </ResizablePanel>

        <ResizableHandle with-handle class="cl:hover:bg-primary/70 cl:h-px cl:bg-white/10" />

        <ResizablePanel :default-size="66" :min-size="30">
          <ResizablePanelGroup direction="horizontal" class="cl:min-h-0">
            <ResizablePanel :default-size="inspectorOpen ? 62 : 100" :min-size="35">
              <div class="cl:flex cl:h-full cl:min-h-0 cl:flex-col cl:bg-[#1c1d1e]">
                <div
                  v-if="selectedRun"
                  class="cl:flex cl:h-6 cl:shrink-0 cl:items-center cl:border-b cl:border-white/6 cl:bg-[#18191a] cl:px-2 cl:font-mono cl:text-[9px] cl:text-zinc-600"
                >
                  Trace · {{ chronologicalRuns.length }} runs · {{ visibleSteps.length }} steps
                </div>
                <div
                  v-if="selectedRun && filteredStepItems.length"
                  v-bind="stepContainerProps"
                  class="cl:min-h-0 cl:flex-1 cl:overflow-y-auto"
                >
                  <div v-bind="stepWrapperProps">
                    <button
                      v-for="item in virtualStepItems"
                      :key="item.data.step.id"
                      type="button"
                      class="cl:group cl:grid cl:h-10 cl:w-full cl:grid-cols-[26px_68px_minmax(0,1fr)_76px] cl:items-center cl:border-b cl:border-white/7 cl:text-left cl:transition cl:hover:bg-white/3.5"
                      :class="
                        selectedStep?.id === item.data.step.id
                          ? 'cl:border-l-primary cl:border-l-3 cl:bg-white/4.5'
                          : 'cl:border-l-3 cl:border-l-transparent'
                      "
                      @click="selectStep(item.data.step)"
                    >
                      <span class="cl:flex cl:justify-center">
                        <CircleDot
                          class="cl:size-2.5"
                          :class="
                            item.data.step.status === 'failed'
                              ? 'cl:text-red-400'
                              : item.data.step.status === 'running'
                                ? 'cl:text-amber-400'
                                : 'cl:text-zinc-600'
                          "
                        />
                      </span>
                      <span class="cl:py-1.5">
                        <Badge
                          class="cl:inline-flex cl:rounded cl:px-1.5 cl:py-0.5 cl:font-mono cl:text-[9px] cl:font-semibold cl:tracking-wide cl:uppercase"
                          :class="laneClass(item.data.step.lane)"
                        >
                          {{ item.data.step.lane }}
                        </Badge>
                      </span>
                      <span
                        class="cl:flex cl:min-w-0 cl:items-baseline cl:gap-3 cl:overflow-hidden cl:pr-3"
                      >
                        <strong
                          class="cl:shrink-0 cl:font-mono cl:text-[12px] cl:font-normal cl:text-zinc-200"
                          >{{ item.data.step.label }}</strong
                        >
                        <span class="cl:truncate cl:font-mono cl:text-[11px] cl:text-zinc-500">{{
                          item.data.preview
                        }}</span>
                      </span>
                      <span
                        class="cl:pr-3 cl:text-right cl:font-mono cl:text-[10px] cl:text-zinc-600"
                        >{{ formatDuration(item.data.step.durationMs) }}</span
                      >
                    </button>
                  </div>
                </div>

                <div
                  v-if="selectedRun && !filteredStepItems.length"
                  class="cl:grid cl:min-h-0 cl:flex-1 cl:place-items-center cl:px-6 cl:text-center cl:text-xs cl:text-zinc-600"
                >
                  没有匹配的步骤
                </div>
                <div
                  v-if="!selectedRun"
                  class="cl:grid cl:h-full cl:min-h-60 cl:place-items-center cl:text-sm cl:text-zinc-600"
                >
                  等待执行轨迹
                </div>
              </div>
            </ResizablePanel>

            <ResizableHandle
              v-if="inspectorOpen"
              with-handle
              class="cl:hover:bg-primary/70 cl:w-px cl:bg-white/10"
            />
            <ResizablePanel v-if="inspectorOpen" :default-size="38" :min-size="25">
              <TraceInspector
                :asset-base-url="props.assetBaseUrl"
                :step="selectedStep"
                @close="inspectorOpen = false"
              />
            </ResizablePanel>
          </ResizablePanelGroup>
        </ResizablePanel>
      </ResizablePanelGroup>
    </TabsContent>
  </Tabs>
</template>

<style scoped>
.devtools-view-tab {
  height: 100%;
  flex: none;
  padding: 0;
  border: 0;
  border-bottom: 2px solid transparent;
  border-radius: 0;
  background: transparent;
  color: #a1a1aa;
  font-size: 12px;
  font-weight: 500;
  line-height: 18px;
  box-shadow: none;
}

.devtools-view-tab[data-state='active'] {
  border-bottom-color: var(--primary);
  background: transparent;
  color: var(--primary);
}

.lane-sensory {
  background: var(--trace-sensory);
  color: var(--trace-surface);
}

.lane-asr {
  background: var(--trace-asr);
  color: var(--trace-surface);
}

.lane-vision {
  background: var(--trace-vision);
  color: var(--trace-surface);
}

.lane-context {
  background: var(--trace-context);
  color: var(--trace-surface);
}

.lane-memory {
  background: var(--trace-memory);
  color: var(--trace-surface);
}

.lane-model {
  background: var(--trace-model);
  color: var(--trace-surface);
}

.lane-tool {
  background: var(--trace-tool);
  color: var(--trace-surface);
}

.lane-nucleus {
  background: var(--trace-nucleus);
  color: var(--trace-surface);
}

.console-scrollbar {
  scrollbar-color: #4b4d50 #202122;
  scrollbar-width: thin;
}
</style>
