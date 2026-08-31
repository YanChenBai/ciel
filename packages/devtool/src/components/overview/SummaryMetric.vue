<script setup lang="ts">
defineProps<{
  label: string;
  value: number | string;
}>();
</script>

<template>
  <article class="dx:rounded-lg dx:border dx:border-white/8 dx:bg-white/3 dx:p-4">
    <p class="dx:text-[11px] dx:font-medium dx:tracking-wide dx:text-zinc-500 dx:uppercase">
      {{ label }}
    </p>
    <p class="dx:mt-2 dx:font-mono dx:text-2xl dx:font-semibold dx:text-zinc-100">
      {{ value }}
    </p>
  </article>
</template>
