<script setup lang="ts">
import { reactiveOmit } from '@vueuse/core';
import type { ScrollAreaScrollbarProps } from 'reka-ui';
import { ScrollAreaScrollbar, ScrollAreaThumb } from 'reka-ui';
import type { HTMLAttributes } from 'vue';

import { cn } from '@/lib/utils';

const props = withDefaults(
  defineProps<ScrollAreaScrollbarProps & { class?: HTMLAttributes['class'] }>(),
  {
    orientation: 'vertical',
  },
);

const delegatedProps = reactiveOmit(props, 'class');
</script>

<template>
  <ScrollAreaScrollbar
    data-slot="scroll-area-scrollbar"
    v-bind="delegatedProps"
    :class="
      cn(
        'cl:flex cl:touch-none cl:p-px cl:transition-colors cl:select-none',
        orientation === 'vertical' && 'cl:h-full cl:w-2.5 cl:border-l cl:border-l-transparent',
        orientation === 'horizontal' && 'cl:h-2.5 cl:flex-col cl:border-t cl:border-t-transparent',
        props.class,
      )
    "
  >
    <ScrollAreaThumb
      data-slot="scroll-area-thumb"
      class="cl:relative cl:flex-1 cl:rounded-full cl:bg-[#484a4e] cl:transition-colors cl:hover:bg-[#62656a]"
    />
  </ScrollAreaScrollbar>
</template>
