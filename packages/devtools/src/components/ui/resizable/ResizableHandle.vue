<script setup lang="ts">
import { GripVertical } from '@lucide/vue';
import { reactiveOmit } from '@vueuse/core';
import type { SplitterResizeHandleEmits, SplitterResizeHandleProps } from 'reka-ui';
import { SplitterResizeHandle, useForwardPropsEmits } from 'reka-ui';
import type { HTMLAttributes } from 'vue';

import { cn } from '@/lib/utils';

const props = defineProps<
  SplitterResizeHandleProps & { class?: HTMLAttributes['class']; withHandle?: boolean }
>();
const emits = defineEmits<SplitterResizeHandleEmits>();

const delegatedProps = reactiveOmit(props, 'class', 'withHandle');
const forwarded = useForwardPropsEmits(delegatedProps, emits);
</script>

<template>
  <SplitterResizeHandle
    data-slot="resizable-handle"
    v-bind="forwarded"
    :class="
      cn(
        'cl:bg-border cl:focus-visible:ring-ring cl:relative cl:flex cl:w-px cl:items-center cl:justify-center cl:after:absolute cl:after:inset-y-0 cl:after:left-1/2 cl:after:w-1 cl:after:-translate-x-1/2 cl:focus-visible:ring-1 cl:focus-visible:ring-offset-1 cl:focus-visible:outline-hidden cl:data-[orientation=vertical]:h-px cl:data-[orientation=vertical]:w-full cl:data-[orientation=vertical]:after:left-0 cl:data-[orientation=vertical]:after:h-1 cl:data-[orientation=vertical]:after:w-full cl:data-[orientation=vertical]:after:translate-x-0 cl:data-[orientation=vertical]:after:-translate-y-1/2 cl:[&[data-orientation=vertical]>div]:rotate-90',
        props.class,
      )
    "
  >
    <template v-if="props.withHandle">
      <div
        class="cl:bg-border cl:z-10 cl:flex cl:h-4 cl:w-3 cl:items-center cl:justify-center cl:rounded-xs cl:border"
      >
        <slot>
          <GripVertical class="cl:size-2.5" />
        </slot>
      </div>
    </template>
  </SplitterResizeHandle>
</template>
