<script setup lang="ts">
import type { DevtoolEvent, DevtoolSnapshot, TargetDescriptor } from '@ciels/devtool-protocol';
import { TabsItem, TabsList, TabsPanel, TabsRoot } from '@vuetify/v0/components';
import { shallowRef } from 'vue';

import type { DevtoolClientStatus } from '@/client/types.ts';
import EventStreamPanel from '@/components/events/EventStreamPanel.vue';
import OverviewPanel from '@/components/overview/OverviewPanel.vue';
import TargetHeader from '@/components/shell/TargetHeader.vue';

defineProps<{
  events: readonly DevtoolEvent[];
  snapshot?: DevtoolSnapshot;
  status: DevtoolClientStatus;
  target?: TargetDescriptor;
}>();

const activeTab = shallowRef('overview');
</script>

<template>
  <div class="devtool dx:flex dx:h-full dx:min-h-0 dx:flex-col dx:bg-[#111214] dx:text-zinc-200">
    <TargetHeader
      :client-status="status"
      :runtime-status="snapshot?.runtime.status"
      :target="target"
    />

    <TabsRoot v-model="activeTab" class="dx:flex dx:min-h-0 dx:flex-1 dx:flex-col">
      <TabsList
        aria-label="Devtool views"
        class="dx:flex dx:h-10 dx:shrink-0 dx:items-end dx:gap-5 dx:border-b dx:border-white/10 dx:px-5"
      >
        <TabsItem value="overview" class="devtool-tab">Overview</TabsItem>
        <TabsItem value="events" class="devtool-tab">Events</TabsItem>
      </TabsList>

      <TabsPanel value="overview" class="dx:min-h-0 dx:flex-1 dx:overflow-auto">
        <OverviewPanel v-if="snapshot" :snapshot="snapshot" />
        <p v-else class="dx:grid dx:min-h-64 dx:place-items-center dx:text-xs dx:text-zinc-600">
          Waiting for target snapshot
        </p>
      </TabsPanel>
      <TabsPanel value="events" class="dx:min-h-0 dx:flex-1 dx:overflow-auto">
        <EventStreamPanel :events="events" />
      </TabsPanel>
    </TabsRoot>
  </div>
</template>

<style scoped>
.devtool-tab {
  height: 100%;
  border-bottom: 2px solid transparent;
  color: #71717a;
  font-size: 0.75rem;
}

.devtool-tab[aria-selected='true'] {
  border-bottom-color: #8b5cf6;
  color: #f4f4f5;
}
</style>
