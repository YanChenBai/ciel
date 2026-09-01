<script setup lang="ts">
import { AlertDescription, AlertRoot, AlertTitle } from '@vuetify/v0/components';
import { onMounted } from 'vue';

import type { DevtoolClient } from '@/client/types.ts';
import DevtoolShell from '@/components/shell/DevtoolShell.vue';
import { useDevtoolSession } from '@/composables/useDevtoolSession.ts';

const props = defineProps<{
  client: DevtoolClient;
}>();

const { engramEntries, error, operations, start } = useDevtoolSession(props.client);

onMounted(() => {
  void start().catch(() => undefined);
});
</script>

<template>
  <AlertRoot
    v-if="error"
    class="devtool dx:grid dx:h-full dx:place-items-center dx:bg-background dx:p-8 dx:text-foreground"
  >
    <div class="dx:max-w-lg dx:rounded-lg dx:border dx:border-red-400/20 dx:bg-red-400/5 dx:p-5">
      <AlertTitle class="dx:text-sm dx:font-semibold dx:text-red-200">
        Unable to open devtool session
      </AlertTitle>
      <AlertDescription class="dx:mt-2 dx:text-xs dx:leading-5 dx:text-red-200/70">
        {{ error instanceof Error ? error.message : String(error) }}
      </AlertDescription>
    </div>
  </AlertRoot>
  <DevtoolShell v-else :entries="engramEntries" :operations="operations" />
</template>
