<script setup lang="ts">
import { ChevronDown, LogIn, LogOut, Radio, Square } from '@lucide/vue';
import {
  ButtonContent,
  ButtonRoot,
  PopoverActivator,
  PopoverContent,
  PopoverRoot,
} from '@vuetify/v0/components';

import type { AppState } from '../../../shared/types.ts';

defineProps<{ pending: boolean; state?: AppState; title: string }>();
const emit = defineEmits<{
  login: [];
  logout: [];
  stop: [];
}>();
</script>

<template>
  <header class="titlebar">
    <div
      v-if="state?.running"
      class="titlebar-status flex min-w-0 flex-1 items-center gap-2 select-none"
    >
      <Radio class="text-primary size-[15px]" />
      <strong class="truncate text-xs font-medium">{{ title }}</strong>
      <span class="pill" :class="{ autonomous: state.mode === 'autonomous' }">
        {{ state.mode === 'autonomous' ? '自主模式' : '标准模式' }}
      </span>
      <span class="pill">
        {{ state.danmakuDelivery === 'live' ? '真实弹幕' : '测试弹幕' }}
      </span>
    </div>
    <div class="no-drag ml-auto flex shrink-0 items-center gap-1.5">
      <ButtonRoot
        v-if="state?.running"
        class="danger-button titlebar-button"
        :disabled="pending"
        @click="emit('stop')"
        ><ButtonContent class="titlebar-button-content"
          ><Square class="size-2.5" />停止</ButtonContent
        ></ButtonRoot
      >
      <PopoverRoot v-if="state?.account">
        <PopoverActivator class="account-button titlebar-button"
          ><img
            v-if="state.account.face"
            :src="state.account.face"
            :alt="state.account.name"
            draggable="false"
            referrerpolicy="no-referrer"
            class="size-5 rounded-full" /><span class="text-[11px] leading-none">{{
            state.account.name
          }}</span
          ><ChevronDown class="size-3"
        /></PopoverActivator>
        <PopoverContent class="account-popover"
          ><ButtonRoot class="danger-menu" @click="emit('logout')"
            ><ButtonContent class="text-xs leading-none"
              ><LogOut class="size-3.5" />退出账号</ButtonContent
            ></ButtonRoot
          ></PopoverContent
        >
      </PopoverRoot>
      <ButtonRoot
        v-else
        class="secondary-button titlebar-button"
        :disabled="pending"
        @click="emit('login')"
        ><ButtonContent class="titlebar-button-content"
          ><LogIn class="size-3" />登录</ButtonContent
        ></ButtonRoot
      >
    </div>
  </header>
</template>
