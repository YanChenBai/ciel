<script setup lang="ts">
import { X } from '@lucide/vue';
import type { DialogContentEmits, DialogContentProps } from 'reka-ui';
import {
  DialogClose,
  DialogContent,
  DialogOverlay,
  DialogPortal,
  useForwardPropsEmits,
} from 'reka-ui';
import type { HTMLAttributes } from 'vue';

import { cn } from '../../../lib/utils.ts';

const props = defineProps<DialogContentProps & { class?: HTMLAttributes['class'] }>();
const emits = defineEmits<DialogContentEmits>();
const forwarded = useForwardPropsEmits(props, emits);
</script>

<template>
  <DialogPortal>
    <DialogOverlay
      class="data-[state=closed]:animate-out data-[state=open]:animate-in fixed inset-0 z-50 bg-black/75 backdrop-blur-sm"
    />
    <DialogContent
      v-bind="forwarded"
      :class="
        cn(
          'fixed top-1/2 left-1/2 z-50 grid max-h-[88vh] w-[min(920px,calc(100vw-2rem))] -translate-x-1/2 -translate-y-1/2 gap-4 overflow-hidden rounded-xl border border-white/10 bg-zinc-950 text-zinc-100 shadow-2xl outline-none',
          props.class,
        )
      "
    >
      <slot />
      <DialogClose
        class="absolute top-4 right-4 rounded-md p-1.5 text-zinc-500 transition-colors hover:bg-white/5 hover:text-zinc-100 focus-visible:ring-2 focus-visible:ring-emerald-400/60 focus-visible:outline-none"
      >
        <X class="size-4" />
        <span class="sr-only">关闭</span>
      </DialogClose>
    </DialogContent>
  </DialogPortal>
</template>
