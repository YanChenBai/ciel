<script setup lang="ts">
import type { RuntimeStatus, TargetDescriptor } from '@ciels/devtool-protocol';
import { computed } from 'vue';

import type { DevtoolClientStatus } from '@/client/types.ts';

const props = defineProps<{
  clientStatus: DevtoolClientStatus;
  runtimeStatus?: RuntimeStatus;
  target?: TargetDescriptor;
}>();

const connectionLabel = computed(() => {
  if (props.clientStatus === 'connected') return 'Connected';
  if (props.clientStatus === 'connecting') return 'Connecting';
  if (props.clientStatus === 'closed') return 'Closed';
  return 'Idle';
});
</script>

<template>
  <header
    class="dx:flex dx:min-h-14 dx:items-center dx:justify-between dx:gap-4 dx:border-b dx:border-white/10 dx:bg-zinc-950/70 dx:px-5"
  >
    <div class="dx:min-w-0">
      <p class="dx:truncate dx:text-sm dx:font-medium dx:text-zinc-100">
        {{ target?.name ?? 'Ciel Devtool' }}
      </p>
      <p class="dx:truncate dx:font-mono dx:text-[10px] dx:text-zinc-500">
        {{ target?.id ?? 'Waiting for target' }}
      </p>
    </div>
    <div class="dx:flex dx:items-center dx:gap-3 dx:text-[11px]">
      <span v-if="runtimeStatus" class="dx:font-mono dx:text-zinc-400">
        runtime/{{ runtimeStatus }}
      </span>
      <span
        class="dx:inline-flex dx:items-center dx:gap-1.5 dx:rounded-full dx:border dx:border-white/10 dx:bg-white/4 dx:px-2.5 dx:py-1 dx:text-zinc-300"
      >
        <span
          class="dx:size-1.5 dx:rounded-full"
          :class="clientStatus === 'connected' ? 'dx:bg-emerald-400' : 'dx:bg-zinc-600'"
        />
        {{ connectionLabel }}
      </span>
    </div>
  </header>
</template>
