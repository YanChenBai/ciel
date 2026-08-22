<script setup lang="ts">
import { reactiveOmit } from '@vueuse/core';
import type { TabsTriggerProps } from 'reka-ui';
import { TabsTrigger, useForwardProps } from 'reka-ui';
import type { HTMLAttributes } from 'vue';

import { cn } from '@/lib/utils';

const props = defineProps<TabsTriggerProps & { class?: HTMLAttributes['class'] }>();

const delegatedProps = reactiveOmit(props, 'class');

const forwardedProps = useForwardProps(delegatedProps);
</script>

<template>
  <TabsTrigger
    data-slot="tabs-trigger"
    :class="
      cn(
        `cl:data-[state=active]:bg-background cl:dark:data-[state=active]:text-foreground cl:focus-visible:border-ring cl:focus-visible:ring-ring/50 cl:focus-visible:outline-ring cl:dark:data-[state=active]:border-input cl:dark:data-[state=active]:bg-input/30 cl:text-foreground cl:dark:text-muted-foreground cl:inline-flex cl:h-[calc(100%-1px)] cl:flex-1 cl:items-center cl:justify-center cl:gap-1.5 cl:rounded-md cl:border cl:border-transparent cl:px-2 cl:py-1 cl:text-[12px] cl:font-medium cl:whitespace-nowrap cl:transition-[color,box-shadow] cl:focus-visible:ring-3 cl:focus-visible:outline-1 cl:disabled:pointer-events-none cl:disabled:opacity-50 cl:data-[state=active]:shadow-sm cl:[&_svg]:pointer-events-none cl:[&_svg]:shrink-0 cl:[&_svg:not([class*='size-'])]:size-4`,
        props.class,
      )
    "
    v-bind="forwardedProps"
  >
    <slot />
  </TabsTrigger>
</template>
