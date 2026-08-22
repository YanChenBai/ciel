<script setup lang="ts">
import { reactiveOmit } from '@vueuse/core';
import type { SelectSeparatorProps } from 'reka-ui';
import { SelectSeparator } from 'reka-ui';
import type { HTMLAttributes } from 'vue';

import { cn } from '@/lib/utils';

const props = defineProps<SelectSeparatorProps & { class?: HTMLAttributes['class'] }>();

const delegatedProps = reactiveOmit(props, 'class');
</script>

<template>
  <SelectSeparator
    data-slot="select-separator"
    v-bind="delegatedProps"
    :class="cn('cl:bg-border cl:pointer-events-none cl:-mx-1 cl:my-1 cl:h-px', props.class)"
  />
</template>
