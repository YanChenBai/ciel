<script setup lang="ts">
import { ChevronRight, PanelRightClose } from '@lucide/vue';
import { shallowRef } from 'vue';

import InspectorSection from '@/components/devtools/InspectorSection.vue';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import type { VigiliaStep, VigiliaStepLane } from '@/lib/trace';

defineProps<{
  step?: VigiliaStep;
}>();

const emit = defineEmits<{
  close: [];
}>();

const tab = shallowRef<'events' | 'payload' | 'result' | 'summary'>('summary');

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
  <aside class="flex h-full min-h-0 flex-col overflow-hidden bg-[#222324]">
    <header class="flex h-[51px] shrink-0 items-center border-b border-white/10 px-4">
      <span
        class="mr-3 font-mono text-[11px] font-semibold tracking-wide uppercase"
        :class="step ? laneClass(step.lane) : 'text-zinc-500'"
      >
        {{ step?.lane ?? 'step' }}
      </span>
      <strong class="truncate font-mono text-xs font-normal text-zinc-400">
        {{ step?.name ?? 'No selection' }}
      </strong>
      <Button
        variant="ghost"
        size="icon-sm"
        class="ml-auto text-zinc-600 hover:bg-white/5 hover:text-zinc-200"
        aria-label="隐藏检查器"
        @click="emit('close')"
      >
        <PanelRightClose class="size-4" />
      </Button>
    </header>

    <Tabs v-model="tab" class="min-h-0 flex-1 gap-0">
      <TabsList
        class="h-[43px] w-full shrink-0 justify-start gap-0 rounded-none border-b border-white/10 bg-transparent p-0"
      >
        <TabsTrigger
          v-for="value in ['summary', 'payload', 'result', 'events'] as const"
          :key="value"
          :value="value"
          class="h-full rounded-none border-x-0 border-t-0 border-b-2 border-transparent bg-transparent px-0 text-xs text-zinc-500 capitalize shadow-none data-[state=active]:border-[#FB7299] data-[state=active]:bg-white/[0.035] data-[state=active]:text-zinc-100 data-[state=active]:shadow-none"
        >
          {{ value }}
        </TabsTrigger>
      </TabsList>

      <ScrollArea class="min-h-0 flex-1">
        <div>
          <TabsContent value="summary" class="mt-0">
            <section v-if="step" class="border-t border-white/10 text-xs">
              <InspectorSection title="Overview" default-open>
                <dl class="grid grid-cols-[92px_minmax(0,1fr)] gap-y-2.5">
                  <dt class="text-zinc-500">Hierarchy</dt>
                  <dd class="flex items-center gap-1 text-zinc-300">
                    Trace <ChevronRight class="size-3 text-zinc-600" /> {{ step.lane }}
                  </dd>
                  <dt class="text-zinc-500">Status</dt>
                  <dd class="text-zinc-200 capitalize">{{ step.status }}</dd>
                  <dt class="text-zinc-500">Started</dt>
                  <dd class="font-mono text-zinc-300">{{ formatClock(step.startedAt) }}</dd>
                  <dt class="text-zinc-500">Duration</dt>
                  <dd class="font-mono text-zinc-300">{{ formatDuration(step.durationMs) }}</dd>
                  <dt class="text-zinc-500">Operation</dt>
                  <dd class="truncate font-mono text-zinc-400">{{ step.id }}</dd>
                </dl>
              </InspectorSection>
              <InspectorSection title="Payload" :value="step.input" :deep="2" default-open />
              <InspectorSection title="Result" :value="step.output" :deep="2" default-open />
              <InspectorSection title="Events" :value="step.events" />
            </section>
          </TabsContent>

          <TabsContent value="payload" class="mt-0">
            <div class="border-t border-white/10">
              <InspectorSection title="Captured input" :value="step?.input" default-open />
            </div>
          </TabsContent>

          <TabsContent value="result" class="mt-0">
            <div class="border-t border-white/10">
              <InspectorSection title="Captured output" :value="step?.output" default-open />
            </div>
          </TabsContent>

          <TabsContent value="events" class="mt-0">
            <div class="border-t border-white/10">
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
  color: #7eabff;
}

.lane-context {
  color: #72d7a5;
}

.lane-memory {
  color: #65cbd8;
}

.lane-model {
  color: #c59be8;
}

.lane-tool {
  color: #ffb160;
}

.lane-nucleus {
  color: #ff8eb0;
}
</style>
