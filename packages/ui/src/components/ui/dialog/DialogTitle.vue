<script setup lang="ts">
import type { DialogTitleProps } from 'reka-ui';
import { DialogTitle } from 'reka-ui';
</script>

<template>
  <DialogTitle v-bind="$props" class="text-lg font-semibold tracking-tight text-zinc-50">
    <slot />
  </DialogTitle>
</template>
