<script setup lang="ts">
import type { DevtoolSnapshot } from '@ciels/devtool-protocol';

import SummaryMetric from './SummaryMetric.vue';

defineProps<{
  snapshot: DevtoolSnapshot;
}>();
</script>

<template>
  <section class="dx:grid dx:gap-4 dx:p-5 dx:sm:grid-cols-2 dx:xl:grid-cols-4">
    <SummaryMetric label="Operations" :value="snapshot.telemetry.operations" />
    <SummaryMetric label="Active" :value="snapshot.telemetry.activeOperations" />
    <SummaryMetric label="Engram entries" :value="snapshot.engram.size" />
    <SummaryMetric label="Agent messages" :value="snapshot.agent.messages" />

    <article
      class="dx:col-span-full dx:overflow-hidden dx:rounded-lg dx:border dx:border-white/8 dx:bg-white/3"
    >
      <header class="dx:border-b dx:border-white/8 dx:px-4 dx:py-3">
        <h2 class="dx:text-xs dx:font-medium dx:text-zinc-300">Active operations</h2>
      </header>
      <ul v-if="snapshot.activeOperations.length" class="dx:divide-y dx:divide-white/6">
        <li
          v-for="operation in snapshot.activeOperations"
          :key="operation.id"
          class="dx:grid dx:grid-cols-[minmax(0,1fr)_auto] dx:gap-4 dx:px-4 dx:py-3"
        >
          <span class="dx:truncate dx:font-mono dx:text-xs dx:text-zinc-200">
            {{ operation.name }}
          </span>
          <span class="dx:text-[11px] dx:text-zinc-500">{{ operation.category }}</span>
        </li>
      </ul>
      <p v-else class="dx:px-4 dx:py-8 dx:text-center dx:text-xs dx:text-zinc-600">
        No active operations
      </p>
    </article>
  </section>
</template>
