<script setup lang="ts">
import type { AnyVigiliaEvent, VigiliaSnapshot } from '@ciels/bridge/protocol';
import { VigiliaDebugger } from '@ciels/ui';
import { ref, shallowRef } from 'vue';

import { onMessage } from './lib/client.ts';

const events = shallowRef<readonly AnyVigiliaEvent[]>([]);
const snapshot = shallowRef<VigiliaSnapshot>({
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
});
const connected = ref(false);

onMessage(message => {
  connected.value = true;
  snapshot.value = message.snapshot;

  if (message.type === 'vigilia.bootstrap') {
    events.value = message.events.slice(-500);
    return;
  }

  if (events.value.some(event => event.sequence === message.event.sequence)) return;
  events.value = [...events.value, message.event].slice(-500);
});
</script>

<template>
  <VigiliaDebugger :connected="connected" :events="events" :snapshot="snapshot" />
</template>
