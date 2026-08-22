<script setup lang="ts">
import { ChevronDown } from '@lucide/vue';
import { reactiveOmit } from '@vueuse/core';
import type { SelectTriggerProps } from 'reka-ui';
import { SelectIcon, SelectTrigger, useForwardProps } from 'reka-ui';
import type { HTMLAttributes } from 'vue';

import { cn } from '@/lib/utils';

const props = withDefaults(
  defineProps<SelectTriggerProps & { class?: HTMLAttributes['class']; size?: 'sm' | 'default' }>(),
  { size: 'default' },
);

const delegatedProps = reactiveOmit(props, 'class', 'size');
const forwardedProps = useForwardProps(delegatedProps);
</script>

<template>
  <SelectTrigger
    data-slot="select-trigger"
    :data-size="size"
    v-bind="forwardedProps"
    :class="
      cn(
        `cl:border-input cl:data-[placeholder]:text-muted-foreground cl:[&_svg:not([class*='text-'])]:text-muted-foreground cl:focus-visible:border-ring cl:focus-visible:ring-ring/50 cl:aria-invalid:ring-destructive/20 cl:dark:aria-invalid:ring-destructive/40 cl:aria-invalid:border-destructive cl:dark:bg-input/30 cl:dark:hover:bg-input/50 cl:flex cl:w-fit cl:items-center cl:justify-between cl:gap-2 cl:rounded-md cl:border cl:bg-transparent cl:px-3 cl:py-2 cl:text-sm cl:whitespace-nowrap cl:shadow-xs cl:transition-[color,box-shadow] cl:outline-none cl:focus-visible:ring-3 cl:disabled:cursor-not-allowed cl:disabled:opacity-50 cl:data-[size=default]:h-9 cl:data-[size=sm]:h-8 cl:*:data-[slot=select-value]:line-clamp-1 cl:*:data-[slot=select-value]:flex cl:*:data-[slot=select-value]:items-center cl:*:data-[slot=select-value]:gap-2 cl:[&_svg]:pointer-events-none cl:[&_svg]:shrink-0 cl:[&_svg:not([class*='size-'])]:size-4`,
        props.class,
      )
    "
  >
    <slot />
    <SelectIcon as-child>
      <ChevronDown class="cl:size-4 cl:opacity-50" />
    </SelectIcon>
  </SelectTrigger>
</template>
