<script setup lang="ts">
import { ChevronDown } from '@lucide/vue';
import { reactiveOmit } from '@vueuse/core';
import type { SelectScrollDownButtonProps } from 'reka-ui';
import { SelectScrollDownButton, useForwardProps } from 'reka-ui';
import type { HTMLAttributes } from 'vue';

import { cn } from '@/lib/utils';

const props = defineProps<SelectScrollDownButtonProps & { class?: HTMLAttributes['class'] }>();

const delegatedProps = reactiveOmit(props, 'class');

const forwardedProps = useForwardProps(delegatedProps);
</script>

<template>
  <SelectScrollDownButton
    data-slot="select-scroll-down-button"
    v-bind="forwardedProps"
    :class="cn('cl:flex cl:cursor-default cl:items-center cl:justify-center cl:py-1', props.class)"
  >
    <slot>
      <ChevronDown class="cl:size-4" />
    </slot>
  </SelectScrollDownButton>
</template>
