<script setup lang="ts">
import { AlertDescription, AlertRoot } from '@vuetify/v0/components';
import { shallowRef, watch } from 'vue';

import type { AppView } from '../../shared/types.ts';
import AppHeader from './components/AppHeader.vue';
import DevtoolView from './components/DevtoolView.vue';
import SetupView from './components/SetupView.vue';
import WatchView from './components/WatchView.vue';
import { useAppState } from './composables/useAppState.ts';

const activeView = shallowRef<AppView>('watch');
const app = useAppState();
watch(app.title, value => {
  document.title = value;
});
</script>

<template>
  <main class="bg-background text-foreground flex h-full min-h-0 flex-col">
    <AppHeader
      v-model:active-view="activeView"
      :pending="app.pending.value"
      :state="app.state.value"
      :title="app.title.value"
      @login="app.login"
      @logout="app.logout"
      @stop="app.stop"
    />
    <AlertRoot
      v-if="app.error.value || app.state.value?.error"
      class="border-b border-red-400/25 bg-red-400/10 px-4 py-2 text-xs text-red-200"
      ><AlertDescription>{{
        app.error.value || app.state.value?.error
      }}</AlertDescription></AlertRoot
    >
    <template v-if="activeView === 'watch'">
      <WatchView v-if="app.state.value?.running" :state="app.state.value" :visible="true" />
      <SetupView
        v-else
        v-model:area-id="app.areaId.value"
        v-model:delivery="app.delivery.value"
        v-model:mode="app.mode.value"
        v-model:room-id="app.roomId.value"
        :areas="app.areas.value"
        :can-start="app.canStart.value"
        :pending="app.pending.value"
        @start="app.start"
      />
    </template>
    <DevtoolView v-else class="min-h-0 flex-1" />
  </main>
</template>
