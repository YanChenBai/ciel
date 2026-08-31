<script setup lang="ts">
import { Bug, ChevronDown, LogIn, LogOut, Radio, Square } from '@lucide/vue';
import {
  ButtonContent,
  ButtonRoot,
  PopoverActivator,
  PopoverContent,
  PopoverRoot,
} from '@vuetify/v0/components';

import type { AppState, AppView } from '../../../shared/types.ts';

defineProps<{ activeView: AppView; pending: boolean; state?: AppState; title: string }>();
const emit = defineEmits<{
  login: [];
  logout: [];
  stop: [];
  'update:activeView': [value: AppView];
}>();
</script>

<template>
  <header class="titlebar">
    <div v-if="state?.running" class="flex min-w-0 items-center gap-2">
      <Radio class="text-primary size-4" /><strong class="truncate text-xs">{{ title }}</strong
      ><span v-if="state?.running" class="pill">{{
        state.mode === 'autonomous' ? '自主' : '标准'
      }}</span>
    </div>
    <nav class="no-drag ml-auto flex rounded-lg bg-white/5 p-0.5">
      <ButtonRoot
        class="nav-button"
        :class="{ active: activeView === 'watch' }"
        @click="emit('update:activeView', 'watch')"
        ><ButtonContent><Radio class="size-3.5" />观看</ButtonContent></ButtonRoot
      >
      <ButtonRoot
        class="nav-button"
        :class="{ active: activeView === 'devtool' }"
        @click="emit('update:activeView', 'devtool')"
        ><ButtonContent><Bug class="size-3.5" />Devtool</ButtonContent></ButtonRoot
      >
    </nav>
    <ButtonRoot
      v-if="state?.running"
      class="no-drag danger-button"
      :disabled="pending"
      @click="emit('stop')"
      ><ButtonContent><Square class="size-3" />停止</ButtonContent></ButtonRoot
    >
    <PopoverRoot v-if="state?.account">
      <PopoverActivator class="no-drag account-button"
        ><img
          v-if="state.account.face"
          :src="state.account.face"
          :alt="state.account.name"
          class="size-5 rounded-full" /><span>{{ state.account.name }}</span
        ><ChevronDown class="size-3"
      /></PopoverActivator>
      <PopoverContent class="account-popover"
        ><ButtonRoot class="danger-menu" @click="emit('logout')"
          ><ButtonContent><LogOut class="size-3.5" />退出账号</ButtonContent></ButtonRoot
        ></PopoverContent
      >
    </PopoverRoot>
    <ButtonRoot v-else class="no-drag secondary-button" :disabled="pending" @click="emit('login')"
      ><ButtonContent><LogIn class="size-3.5" />登录</ButtonContent></ButtonRoot
    >
  </header>
</template>
