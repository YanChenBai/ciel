<script setup lang="ts">
import { ChevronRight, PanelRightClose } from '@lucide/vue';
import { computed, shallowRef } from 'vue';

import InspectorSection from '@/components/devtools/InspectorSection.vue';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { resolveAssetUrl } from '@/lib/assets';
import type { VigiliaStep, VigiliaStepLane } from '@/lib/trace';

const props = defineProps<{
  assetBaseUrl?: string;
  step?: VigiliaStep;
}>();

const emit = defineEmits<{
  close: [];
}>();

const tab = shallowRef<'events' | 'payload' | 'result' | 'summary'>('summary');
const imageUrl = computed(() => resolveAssetUrl(props.assetBaseUrl, props.step?.output));

function laneClass(lane: VigiliaStepLane): string {
  return `lane-${lane}`;
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
</script>

<template>
  <aside class="cl:flex cl:h-full cl:min-h-0 cl:flex-col cl:overflow-hidden cl:bg-[#222324]">
    <header
      class="cl:flex cl:h-11 cl:shrink-0 cl:items-center cl:border-b cl:border-white/10 cl:px-4"
    >
      <span
        class="cl:mr-3 cl:font-mono cl:text-[11px] cl:font-semibold cl:tracking-wide cl:uppercase"
        :class="step ? laneClass(step.lane) : 'cl:text-zinc-500'"
      >
        {{ step?.lane ?? 'step' }}
      </span>
      <strong class="cl:truncate cl:font-mono cl:text-xs cl:font-normal cl:text-zinc-400">
        {{ step?.label ?? 'No selection' }}
      </strong>
      <Button
        variant="ghost"
        size="icon-sm"
        class="cl:ml-auto cl:text-zinc-600 cl:hover:bg-white/5 cl:hover:text-zinc-200"
        aria-label="隐藏检查器"
        @click="emit('close')"
      >
        <PanelRightClose class="cl:size-4" />
      </Button>
    </header>

    <Tabs v-model="tab" class="cl:min-h-0 cl:flex-1 cl:gap-0">
      <TabsList
        class="cl:h-9 cl:w-full cl:shrink-0 cl:justify-start cl:gap-0 cl:rounded-none cl:border-b cl:border-white/10 cl:bg-transparent cl:px-0 cl:py-0"
      >
        <TabsTrigger
          v-for="value in ['summary', 'payload', 'result', 'events'] as const"
          :key="value"
          :value="value"
          class="cl:data-[state=active]:border-primary! cl:h-full cl:rounded-none cl:border-x-0 cl:border-t-0 cl:border-b-2 cl:border-transparent cl:bg-transparent cl:px-0 cl:text-[12px] cl:text-zinc-500 cl:capitalize cl:shadow-none cl:data-[state=active]:bg-white/3.5 cl:data-[state=active]:text-zinc-100 cl:data-[state=active]:shadow-none"
        >
          {{ value }}
        </TabsTrigger>
      </TabsList>

      <ScrollArea class="cl:min-h-0 cl:flex-1">
        <div>
          <TabsContent value="summary" class="cl:mt-0">
            <section v-if="step" class="cl:border-t cl:border-white/10 cl:text-xs">
              <a
                v-if="imageUrl"
                :href="imageUrl"
                target="_blank"
                rel="noreferrer"
                class="cl:block cl:border-b cl:border-white/10 cl:bg-black/20 cl:p-3"
              >
                <img
                  :src="imageUrl"
                  alt="Visual percept preview"
                  loading="lazy"
                  decoding="async"
                  class="cl:max-h-72 cl:w-full cl:rounded cl:object-contain"
                />
              </a>
              <InspectorSection title="Overview" default-open>
                <dl class="cl:grid cl:grid-cols-[92px_minmax(0,1fr)] cl:gap-y-2.5">
                  <dt class="cl:text-zinc-500">Hierarchy</dt>
                  <dd class="cl:flex cl:items-center cl:gap-1 cl:text-zinc-300">
                    Trace <ChevronRight class="cl:size-3 cl:text-zinc-600" /> {{ step.lane }}
                  </dd>
                  <dt class="cl:text-zinc-500">Status</dt>
                  <dd class="cl:text-zinc-200 cl:capitalize">{{ step.status }}</dd>
                  <dt class="cl:text-zinc-500">Name</dt>
                  <dd class="cl:font-mono cl:text-zinc-300">{{ step.name }}</dd>
                  <dt class="cl:text-zinc-500">Started</dt>
                  <dd class="cl:font-mono cl:text-zinc-300">{{ formatClock(step.startedAt) }}</dd>
                  <dt class="cl:text-zinc-500">Duration</dt>
                  <dd class="cl:font-mono cl:text-zinc-300">
                    {{ formatDuration(step.durationMs) }}
                  </dd>
                  <dt class="cl:text-zinc-500">Operation</dt>
                  <dd class="cl:truncate cl:font-mono cl:text-zinc-400">{{ step.id }}</dd>
                </dl>
              </InspectorSection>
              <InspectorSection title="Payload" :value="step.input" :deep="1" default-open />
              <InspectorSection title="Result" :value="step.output" :deep="1" default-open />
              <InspectorSection title="Events" :value="step.events" />
            </section>
          </TabsContent>

          <TabsContent value="payload" class="cl:mt-0">
            <div class="cl:border-t cl:border-white/10">
              <InspectorSection title="Captured input" :value="step?.input" default-open />
            </div>
          </TabsContent>

          <TabsContent value="result" class="cl:mt-0">
            <div class="cl:border-t cl:border-white/10">
              <InspectorSection title="Captured output" :value="step?.output" default-open />
            </div>
          </TabsContent>

          <TabsContent value="events" class="cl:mt-0">
            <div class="cl:border-t cl:border-white/10">
              <InspectorSection title="Raw Vigilia events" :value="step?.events" default-open />
            </div>
          </TabsContent>
        </div>
      </ScrollArea>
    </Tabs>
  </aside>
</template>

<style scoped>
.lane-sensory {
  color: var(--trace-sensory-foreground);
}

.lane-context {
  color: var(--trace-context-foreground);
}

.lane-memory {
  color: var(--trace-memory-foreground);
}

.lane-model {
  color: var(--trace-model-foreground);
}

.lane-tool {
  color: var(--trace-tool-foreground);
}

.lane-nucleus {
  color: var(--primary);
}
</style>
