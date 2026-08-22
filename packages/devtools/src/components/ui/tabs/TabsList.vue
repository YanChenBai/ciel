<script setup lang="ts">
import { reactiveOmit } from '@vueuse/core';
import type { TabsListProps } from 'reka-ui';
import { TabsList } from 'reka-ui';
import type { HTMLAttributes } from 'vue';

import { cn } from '@/lib/utils';

const props = defineProps<TabsListProps & { class?: HTMLAttributes['class'] }>();

const delegatedProps = reactiveOmit(props, 'class');
</script>

<template>
  <TabsList
    data-slot="tabs-list"
    v-bind="delegatedProps"
    :class="
      cn(
        'cl:bg-muted cl:text-muted-foreground cl:inline-flex cl:h-9 cl:w-fit cl:items-center cl:justify-center cl:rounded-lg cl:p-0.75',
        props.class,
      )
    "
  >
    <slot />
  </TabsList>
</template>
