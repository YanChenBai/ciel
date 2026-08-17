<script setup lang="ts">
import type { DialogDescriptionProps } from 'reka-ui';
import { DialogDescription } from 'reka-ui';
</script>

<template>
  <DialogDescription v-bind="$props" class="text-sm leading-6 text-zinc-400">
    <slot />
  </DialogDescription>
</template>
