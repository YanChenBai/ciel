<script setup lang="ts">
import type { AnyVigiliaEvent, VigiliaSnapshot } from '@ciels/vigilia-bridge/protocol';
import { createBridge } from '@ciels/vigilia-bridge/vue';
import { ref, shallowRef } from 'vue';

import CielDevTools from './CielDevTools.vue';

const props = defineProps<{
  endpoint: string;
}>();

const { onMessage } = createBridge(props.endpoint);

const events = shallowRef<readonly AnyVigiliaEvent[]>([]);
const emptySnapshot: VigiliaSnapshot = {
  activeOperations: [],
  performance: { archiveDurationMs: 0, signalDurationMs: 0, thinkDurationMs: 0 },
  state: 'idle',
  throughSequence: 0,
  totals: {
    archives: 0,
    errors: 0,
    inputTokens: 0,
    outputTokens: 0,
    percepts: 0,
    signals: 0,
    thoughts: 0,
  },
};
const snapshot = shallowRef<VigiliaSnapshot>(emptySnapshot);
const connected = ref(false);
const assetBaseUrl = new URL('/assets/', props.endpoint).href;

onMessage(message => {
  connected.value = true;
  snapshot.value = message.snapshot;

  if (message.type === 'vigilia.bootstrap') {
    events.value = message.events;
    return;
  }

  if (events.value.some(event => event.sequence === message.event.sequence)) return;
  events.value = [...events.value, message.event];
});
</script>

<template>
  <CielDevTools
    :asset-base-url="assetBaseUrl"
    :connected="connected"
    :events="events"
    :snapshot="snapshot"
  />
</template>
