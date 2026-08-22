export const LIVE_PAGE_BRIDGE_SOURCE = `(${installLivePageBridge.toString()})()`;

function installLivePageBridge(): void {
  const root = globalThis as typeof globalThis & {
    __cielBliveBridge?: {
      dispose(): void;
      sendDanmaku(content: string): Promise<{ ok: boolean; error?: string }>;
    };
    livePlayer?: {
      sendDanmaku?: (input: {
        msg: string;
      }) => Promise<{ code?: number; message?: string; msg?: string } | void>;
    };
  };

  root.__cielBliveBridge?.dispose();

  const disposers: Array<() => void> = [];
  const emit = (event: Record<string, unknown>): void => {
    window.postMessage(
      {
        event: { ...event, time: Date.now() },
        source: 'ciel-blive-page',
      },
      location.origin,
    );
  };
  const roomId = (): number | undefined => {
    const match = /^\/(?:blanc\/)?(\d+)/u.exec(location.pathname);
    const value = Number(match?.[1]);
    return Number.isSafeInteger(value) ? value : undefined;
  };
  const readText = (selectors: readonly string[]): string | undefined => {
    for (const selector of selectors) {
      const text = document.querySelector(selector)?.textContent?.replaceAll(/\s+/gu, ' ').trim();
      if (text) return text;
    }
    return undefined;
  };
  const reportRoom = (): void => {
    emit({
      type: 'room-info',
      info: {
        roomId: roomId(),
        streamerName: readText([
          '.room-owner-username',
          '.upper-row .name',
          '[class*="anchor-name"]',
        ]),
        title: readText(['.live-title', '.room-title', 'h1']),
      },
    });
  };
  const checkLiveEnded = (): void => {
    const text = document.body?.innerText ?? '';
    if (/当前主播未开播|直播已结束|主播暂时不在家/u.test(text)) {
      emit({ type: 'live-ended', roomId: roomId() });
    }
  };
  const observeVideo = (): void => {
    const video = document.querySelector('video');
    if (!video || video.dataset.cielObserved) return;
    video.dataset.cielObserved = 'true';
    const onEnded = (): void => emit({ type: 'live-ended', roomId: roomId() });
    video.addEventListener('ended', onEnded);
    disposers.push(() => video.removeEventListener('ended', onEnded));
  };
  const interval = window.setInterval(() => {
    observeVideo();
    reportRoom();
    checkLiveEnded();
  }, 5_000);
  disposers.push(() => window.clearInterval(interval));

  root.__cielBliveBridge = {
    dispose(): void {
      for (const dispose of disposers.splice(0)) dispose();
      delete root.__cielBliveBridge;
    },
    async sendDanmaku(content: string): Promise<{ ok: boolean; error?: string }> {
      const normalized = content.trim();
      if (!normalized) return { ok: false, error: '弹幕不能为空' };

      const input = document.querySelector<HTMLElement>(
        'textarea.chat-input, textarea[placeholder*="弹幕"], input[placeholder*="弹幕"], [contenteditable="true"][class*="chat-input"]',
      );
      const button = [...document.querySelectorAll<HTMLElement>('button, [role="button"]')].find(
        element => /发送/u.test(element.textContent ?? ''),
      );

      if (input && button) {
        input.focus();
        if (input instanceof HTMLInputElement || input instanceof HTMLTextAreaElement) {
          const prototype =
            input instanceof HTMLTextAreaElement
              ? HTMLTextAreaElement.prototype
              : HTMLInputElement.prototype;
          const descriptor = Object.getOwnPropertyDescriptor(prototype, 'value');
          // oxlint-disable-next-line typescript/unbound-method -- native setter requires the input as its receiver
          if (descriptor?.set) Reflect.apply(descriptor.set, input, [normalized]);
        } else {
          input.textContent = normalized;
        }
        input.dispatchEvent(new InputEvent('input', { bubbles: true, data: normalized }));
        input.dispatchEvent(new Event('change', { bubbles: true }));
        button.click();
        emit({ type: 'danmaku-sent', content: normalized });
        return { ok: true };
      }

      const sendDanmaku = root.livePlayer?.sendDanmaku;
      if (typeof sendDanmaku !== 'function') {
        return { ok: false, error: '没有找到弹幕输入框或 livePlayer.sendDanmaku' };
      }
      try {
        const response = await sendDanmaku.call(root.livePlayer, { msg: normalized });
        if (response?.code !== undefined && response.code !== 0) {
          return {
            ok: false,
            error: response.message || response.msg || `Bilibili rejected code ${response.code}`,
          };
        }
        emit({ type: 'danmaku-sent', content: normalized });
        return { ok: true };
      } catch (error) {
        return { ok: false, error: error instanceof Error ? error.message : String(error) };
      }
    },
  };

  observeVideo();
  reportRoom();
  checkLiveEnded();
  emit({ type: 'page-ready', roomId: roomId() });
}
