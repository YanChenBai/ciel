<script setup lang="ts">
import { useVModel } from '@vueuse/core';
import type { HTMLAttributes } from 'vue';

import { cn } from '@/lib/utils';

const props = defineProps<{
  defaultValue?: string | number;
  modelValue?: string | number;
  class?: HTMLAttributes['class'];
}>();

const emits = defineEmits<{
  (e: 'update:modelValue', payload: string | number): void;
}>();

const modelValue = useVModel(props, 'modelValue', emits, {
  passive: true,
  defaultValue: props.defaultValue,
});
</script>

<template>
  <input
    v-model="modelValue"
    data-slot="input"
    :class="
      cn(
        'cl:file:text-foreground cl:placeholder:text-muted-foreground cl:selection:bg-primary cl:selection:text-primary-foreground cl:dark:bg-input/30 cl:border-input cl:h-9 cl:w-full cl:min-w-0 cl:rounded-md cl:border cl:bg-transparent cl:px-3 cl:py-1 cl:text-base cl:shadow-xs cl:transition-[color,box-shadow] cl:outline-none cl:file:inline-flex cl:file:h-7 cl:file:border-0 cl:file:bg-transparent cl:file:text-sm cl:file:font-medium cl:disabled:pointer-events-none cl:disabled:cursor-not-allowed cl:disabled:opacity-50 cl:md:text-sm',
        'cl:focus-visible:border-ring cl:focus-visible:ring-ring/50 cl:focus-visible:ring-3',
        'cl:aria-invalid:ring-destructive/20 cl:dark:aria-invalid:ring-destructive/40 cl:aria-invalid:border-destructive',
        props.class,
      )
    "
  />
</template>
