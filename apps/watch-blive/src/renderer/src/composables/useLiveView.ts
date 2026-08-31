import { nextTick, onBeforeUnmount, onMounted, watch, type Ref } from 'vue';

export function useLiveView(host: Ref<HTMLElement | null>, visible: Ref<boolean>) {
  let observer: ResizeObserver | undefined;
  let frame = 0;
  const sync = (): void => {
    cancelAnimationFrame(frame);
    frame = requestAnimationFrame(() => {
      const rect = host.value?.getBoundingClientRect();
      if (!visible.value || !rect) return;
      window.watchBlive.liveView.setBounds({
        x: rect.x,
        y: rect.y,
        width: rect.width,
        height: rect.height,
      });
    });
  };
  onMounted(async () => {
    observer = new ResizeObserver(sync);
    if (host.value) observer.observe(host.value);
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
    cancelAnimationFrame(frame);
    observer?.disconnect();
    window.watchBlive.liveView.setVisible(false);
  });
}
