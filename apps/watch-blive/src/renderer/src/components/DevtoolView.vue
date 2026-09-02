<script setup lang="ts">
import { CielDevtool, createDevtoolClient } from '@ciels/devtool-client';

import { watchBliveTrace } from '../devtool-trace.ts';

const client = createDevtoolClient({
  client: { name: '@ciels/watch-blive', version: '0.0.0' },
  connection: {
    send: message => window.watchBlive.devtool.send(message),
    subscribe: listener => window.watchBlive.devtool.subscribe(message => void listener(message)),
  },
  createId: () => crypto.randomUUID(),
});
</script>

<template>
  <div class="embedded-devtool flex h-full min-h-0 flex-col overflow-hidden">
    <CielDevtool :client="client" :trace="watchBliveTrace" />
  </div>
</template>
