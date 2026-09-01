import { useRaf, useResizeObserver } from '@vuetify/v0';
import { nextTick, onBeforeUnmount, onMounted, watch, type Ref } from 'vue';

export function useLiveView(host: Ref<HTMLElement | null>, visible: Ref<boolean>) {
  const sync = useRaf(() => {
    const rect = host.value?.getBoundingClientRect();
    if (!visible.value || !rect) return;
    window.watchBlive.liveView.setBounds({
      x: rect.x,
      y: rect.y,
      width: rect.width,
      height: rect.height,
    });
  });
  useResizeObserver(host, sync, { immediate: true });

  onMounted(async () => {
    await nextTick();
    window.watchBlive.liveView.setVisible(visible.value);
    sync();
  });
  watch(visible, async value => {
    window.watchBlive.liveView.setVisible(value);
    if (value) {
      await nextTick();
      sync();
    }
  });
  onBeforeUnmount(() => {
    sync.cancel();
    window.watchBlive.liveView.setVisible(false);
  });
}
