<script setup lang="ts">
import { SplitterHandle, SplitterPanel, SplitterRoot } from '@vuetify/v0/components';

import DevtoolView from './DevtoolView.vue';
import LivePlayer from './LivePlayer.vue';

defineProps<{ playbackUrl?: string }>();
</script>

<template>
  <SplitterRoot
    orientation="horizontal"
    class="bg-live flex h-full min-h-0 w-full min-w-0 flex-1 overflow-hidden"
  >
    <SplitterPanel :default-size="56" :min-size="36" class="h-full min-h-0 min-w-0">
      <LivePlayer :src="playbackUrl" />
    </SplitterPanel>
    <SplitterHandle
      label="调整直播区域宽度"
      class="group hover:bg-primary relative z-10 w-px bg-white/10"
      ><span
        class="group-hover:bg-primary absolute top-1/2 left-1/2 h-10 w-1 -translate-1/2 rounded-full bg-zinc-700"
    /></SplitterHandle>
    <SplitterPanel :default-size="44" :min-size="28" class="bg-background h-full min-h-0 min-w-0">
      <DevtoolView class="h-full min-h-0" />
    </SplitterPanel>
  </SplitterRoot>
</template>
