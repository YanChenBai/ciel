<script setup lang="ts">
import type { HTMLAttributes } from 'vue';

import { cn } from '../../../lib/utils.ts';

const props = defineProps<{
  class?: HTMLAttributes['class'];
  variant?: 'ghost' | 'outline';
}>();
</script>

<template>
  <button
    type="button"
    :class="
      cn(
        'inline-flex items-center justify-center rounded-md text-sm font-medium transition-colors outline-none focus-visible:ring-2 focus-visible:ring-emerald-400/60 disabled:pointer-events-none disabled:opacity-50',
        props.variant === 'outline' &&
          'border border-white/10 bg-transparent hover:bg-white/[0.06]',
        props.variant === 'ghost' && 'hover:bg-white/[0.06]',
        props.class,
      )
    "
  >
    <slot />
  </button>
</template>
