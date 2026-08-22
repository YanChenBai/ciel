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
    deep: 3,
    defaultOpen: false,
  },
);

const open = ref(props.defaultOpen);
</script>

<template>
  <CollapsibleRoot v-model:open="open" class="border-b border-white/10">
    <CollapsibleTrigger
      class="group flex h-8 w-full items-center gap-1.5 bg-white/[0.025] px-3 text-left text-xs font-medium text-zinc-300 transition-colors hover:bg-white/[0.05] hover:text-zinc-100"
    >
      <ChevronRight
        class="size-3.5 shrink-0 text-zinc-500 transition-transform group-data-[state=open]:rotate-90"
      />
      {{ title }}
    </CollapsibleTrigger>
    <CollapsibleContent>
      <div class="overflow-x-auto px-4 py-3">
        <slot>
          <ObjectInspector :value="value" :deep="deep" />
        </slot>
      </div>
    </CollapsibleContent>
  </CollapsibleRoot>
</template>
