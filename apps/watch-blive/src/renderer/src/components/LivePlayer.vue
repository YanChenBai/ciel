<script setup lang="ts">
import { Button } from '@vuetify/v0/components';
import { nextTick, shallowRef, useTemplateRef, watch } from 'vue';

const props = defineProps<{ src?: string }>();
const video = useTemplateRef<HTMLVideoElement>('video');
const message = shallowRef('正在连接直播流…');
const needsGesture = shallowRef(false);

watch(
  () => props.src,
  async src => {
    message.value = src ? '正在连接直播流…' : '正在打开直播间…';
    needsGesture.value = false;
    await nextTick();
    const element = video.value;
    if (!element) return;
    element.load();
    if (!src) return;
    try {
      await element.play();
    } catch {
      needsGesture.value = true;
      message.value = '点击开始播放';
    }
  },
  { immediate: true, flush: 'post' },
);

async function play(): Promise<void> {
  const element = video.value;
  if (!element) return;
  await element.play();
  needsGesture.value = false;
}
</script>

<template>
  <div class="relative flex h-full min-h-0 items-center justify-center overflow-hidden bg-black">
    <video
      ref="video"
      :src="props.src"
      autoplay
      controls
      class="h-full w-full object-contain"
      @canplay="message = ''"
      @error="message = '直播流播放失败'"
      @playing="message = ''"
      @waiting="message = '直播流缓冲中…'"
    />
    <div
      v-if="message"
      class="pointer-events-none absolute inset-0 flex items-center justify-center bg-black/35 text-sm text-zinc-300"
    >
      <Button v-if="needsGesture" class="pointer-events-auto" @click="play">开始播放</Button>
      <span v-else>{{ message }}</span>
    </div>
  </div>
</template>
