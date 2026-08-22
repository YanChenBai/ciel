<script setup lang="ts">
import { Check } from '@lucide/vue';
import { reactiveOmit } from '@vueuse/core';
import type { SelectItemProps } from 'reka-ui';
import { SelectItem, SelectItemIndicator, SelectItemText, useForwardProps } from 'reka-ui';
import type { HTMLAttributes } from 'vue';

import { cn } from '@/lib/utils';

const props = defineProps<SelectItemProps & { class?: HTMLAttributes['class'] }>();

const delegatedProps = reactiveOmit(props, 'class');

const forwardedProps = useForwardProps(delegatedProps);
</script>

<template>
  <SelectItem
    data-slot="select-item"
    v-bind="forwardedProps"
    :class="
      cn(
        `cl:focus:bg-accent cl:focus:text-accent-foreground cl:[&_svg:not([class*='text-'])]:text-muted-foreground cl:relative cl:flex cl:w-full cl:cursor-default cl:items-center cl:gap-2 cl:rounded-sm cl:py-1.5 cl:pr-8 cl:pl-2 cl:text-sm cl:outline-hidden cl:select-none cl:data-[disabled]:pointer-events-none cl:data-[disabled]:opacity-50 cl:[&_svg]:pointer-events-none cl:[&_svg]:shrink-0 cl:[&_svg:not([class*='size-'])]:size-4 cl:*:[span]:last:flex cl:*:[span]:last:items-center cl:*:[span]:last:gap-2`,
        props.class,
      )
    "
  >
    <span class="cl:absolute cl:right-2 cl:flex cl:size-3.5 cl:items-center cl:justify-center">
      <SelectItemIndicator>
        <slot name="indicator-icon">
          <Check class="cl:size-4" />
        </slot>
      </SelectItemIndicator>
    </span>

    <SelectItemText>
      <slot />
    </SelectItemText>
  </SelectItem>
</template>
