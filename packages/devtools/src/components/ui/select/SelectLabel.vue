<script setup lang="ts">
import type { SelectLabelProps } from 'reka-ui';
import { SelectLabel } from 'reka-ui';
import type { HTMLAttributes } from 'vue';

import { cn } from '@/lib/utils';

const props = defineProps<SelectLabelProps & { class?: HTMLAttributes['class'] }>();
</script>

<template>
  <SelectLabel
    data-slot="select-label"
    :class="cn('cl:text-muted-foreground cl:px-2 cl:py-1.5 cl:text-xs', props.class)"
  >
    <slot />
  </SelectLabel>
</template>
