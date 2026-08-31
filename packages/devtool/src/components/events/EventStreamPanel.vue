<script setup lang="ts">
import type { DevtoolEvent } from '@ciels/devtool-protocol';
import { computed } from 'vue';

const props = defineProps<{
  events: readonly DevtoolEvent[];
}>();

const latestEvents = computed(() => [...props.events].reverse());

function formatTime(time: number): string {
  return new Intl.DateTimeFormat('zh-CN', {
    hour: '2-digit',
    hour12: false,
    minute: '2-digit',
    second: '2-digit',
    fractionalSecondDigits: 3,
  }).format(time);
}
</script>

<template>
  <ol v-if="latestEvents.length" class="dx:divide-y dx:divide-white/6">
    <li
      v-for="event in latestEvents"
      :key="event.id"
      class="dx:grid dx:grid-cols-[6rem_minmax(0,1fr)_auto] dx:items-center dx:gap-4 dx:px-5 dx:py-3"
    >
      <time class="dx:font-mono dx:text-[10px] dx:text-zinc-600">
        {{ formatTime(event.time) }}
      </time>
      <span class="dx:truncate dx:font-mono dx:text-xs dx:text-zinc-300">
        {{ event.name }}
      </span>
      <span class="dx:font-mono dx:text-[10px] dx:text-zinc-600">
        #{{ event.cursor.sequence }}
      </span>
    </li>
  </ol>
  <p v-else class="dx:grid dx:min-h-64 dx:place-items-center dx:text-xs dx:text-zinc-600">
    Waiting for protocol events
  </p>
</template>
