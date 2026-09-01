<script setup lang="ts">
import type { EngramEntryRecord, OperationRecord } from '@ciels/devtool-protocol';
import { TabsItem, TabsList, TabsPanel, TabsRoot } from '@vuetify/v0/components';
import { shallowRef } from 'vue';

import ConversationPanel from '@/components/conversation/ConversationPanel.vue';
import TracePanel from '@/components/trace/TracePanel.vue';

defineProps<{
  entries: readonly EngramEntryRecord[];
  operations: readonly OperationRecord[];
}>();

const activeTab = shallowRef('trace');
</script>

<template>
  <div class="devtool dx:flex dx:h-full dx:min-h-0 dx:flex-col dx:bg-background dx:text-foreground">
    <TabsRoot v-model="activeTab" class="dx:flex dx:min-h-0 dx:flex-1 dx:flex-col">
      <TabsList
        aria-label="Devtool views"
        class="dx:flex dx:h-8 dx:shrink-0 dx:items-end dx:gap-6 dx:border-b dx:border-[#343537] dx:px-4"
      >
        <TabsItem value="conversation" class="devtool-tab">对话</TabsItem>
        <TabsItem value="trace" class="devtool-tab">轨迹</TabsItem>
      </TabsList>

      <TabsPanel
        value="conversation"
        class="dx:min-h-0 dx:flex-1 dx:overflow-hidden dx:bg-trace-surface"
      >
        <ConversationPanel :entries="entries" :operations="operations" />
      </TabsPanel>
      <TabsPanel value="trace" class="dx:min-h-0 dx:flex-1 dx:overflow-hidden dx:bg-trace-surface">
        <TracePanel :operations="operations" />
      </TabsPanel>
    </TabsRoot>
  </div>
</template>

<style scoped>
.devtool-tab {
  height: 100%;
  padding: 0;
  border: 0;
  border-bottom: 2px solid transparent;
  border-radius: 0;
  background: transparent;
  color: #a1a1aa;
  font-size: 0.75rem;
  font-weight: 500;
}

.devtool-tab[aria-selected='true'] {
  border-bottom-color: var(--primary);
  color: var(--primary);
}
</style>
