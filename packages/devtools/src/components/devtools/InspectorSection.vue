<script setup lang="ts">
import { ChevronRight } from '@lucide/vue';
import { CollapsibleContent, CollapsibleRoot, CollapsibleTrigger } from 'reka-ui';
import { ref } from 'vue';

import ObjectInspector from '@/components/devtools/ObjectInspector.vue';

const props = withDefaults(
  defineProps<{
    deep?: number;
    defaultOpen?: boolean;
    title: string;
    value?: unknown;
  }>(),
  {
    deep: 1,
    defaultOpen: false,
  },
);

const open = ref(props.defaultOpen);
</script>

<template>
  <CollapsibleRoot v-model:open="open" class="cl:border-b cl:border-white/10">
    <CollapsibleTrigger
      class="cl:group cl:flex cl:h-8 cl:w-full cl:items-center cl:gap-1.5 cl:bg-white/2.5 cl:px-3 cl:text-left cl:text-xs cl:font-medium cl:text-zinc-300 cl:transition-colors cl:hover:bg-white/5 cl:hover:text-zinc-100"
    >
      <ChevronRight
        class="cl:size-3.5 cl:shrink-0 cl:text-zinc-500 cl:transition-transform cl:group-data-[state=open]:rotate-90"
      />
      {{ title }}
    </CollapsibleTrigger>
    <CollapsibleContent>
      <div class="cl:overflow-x-auto cl:px-4 cl:py-3">
        <slot>
          <ObjectInspector :value="value" :deep="deep" />
        </slot>
      </div>
    </CollapsibleContent>
  </CollapsibleRoot>
</template>
