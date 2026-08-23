export const LIVE_PAGE_BRIDGE_SOURCE = `(${installLivePageBridge.toString()})()`;

function installLivePageBridge(): void {
  const root = globalThis as typeof globalThis & {
    __cielBliveBridge?: {
      dispose(): void;
      sendDanmaku(content: string): Promise<{ ok: boolean; error?: string }>;
    };
    livePlayer?: {
      on(event: 'ScreenStateChange', listener: (state: string) => void): void;
      setFullscreenStatus(status: number): void;
    };
  };

  root.__cielBliveBridge?.dispose();

  const disposers: Array<() => void> = [];
  const hadHiddenAside = document.body.classList.contains('hide-aside-area');
  const previousBodyOverflow = document.body.style.overflow;
  document.body.classList.add('hide-aside-area');
  document.body.style.overflow = 'hidden';
  disposers.push(() => {
    if (!hadHiddenAside) document.body.classList.remove('hide-aside-area');
    document.body.style.overflow = previousBodyOverflow;
  });

  const style = document.createElement('style');
  style.dataset.cielBlive = 'true';
  style.textContent = `
    #web-player__bottom-bar__container,
    #gift-control-vm,
    #sidebar-vm,
    .side-bar-cntr,
    .aside-area {
      display: none !important;
    }

    .player-full-win .player-section {
      width: 100% !important;
    }
  `;
  (document.head ?? document.documentElement).append(style);
  disposers.push(() => style.remove());

  let playerListenerActive = true;
  const installPlayerBehavior = (): boolean => {
    const player = root.livePlayer;
    if (!player) return false;

    try {
      player.setFullscreenStatus(1);
      player.on('ScreenStateChange', state => {
        if (!playerListenerActive || state !== 'normal') return;
        requestAnimationFrame(() => {
          if (playerListenerActive) player.setFullscreenStatus(1);
        });
      });
      return true;
    } catch {
      return false;
    }
  };
  if (!installPlayerBehavior()) {
    const playerInterval = window.setInterval(() => {
      if (!installPlayerBehavior()) return;
      window.clearInterval(playerInterval);
    }, 250);
    disposers.push(() => window.clearInterval(playerInterval));
  }
  disposers.push(() => {
    playerListenerActive = false;
  });

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

      const input = document.querySelector<HTMLInputElement | HTMLTextAreaElement>(
        '#control-panel-ctnr-box textarea, #control-panel-ctnr-box input[type="text"]',
      );
      const contentEditable = document.querySelector<HTMLElement>(
        '#control-panel-ctnr-box [contenteditable="true"]',
      );
      if (!input && !contentEditable) {
        return { ok: false, error: '没有找到直播页弹幕输入框，请确认账号已登录' };
      }

      const inputEvent = new InputEvent('input', {
        bubbles: true,
        cancelable: true,
        data: normalized,
        inputType: 'insertText',
      });
      if (input) {
        input.focus();
        const prototype =
          input instanceof HTMLTextAreaElement
            ? HTMLTextAreaElement.prototype
            : HTMLInputElement.prototype;
        // oxlint-disable-next-line typescript/unbound-method -- native setter is invoked with the input receiver below
        const valueSetter = Object.getOwnPropertyDescriptor(prototype, 'value')?.set;
        if (!valueSetter) return { ok: false, error: '无法写入直播页弹幕输入框' };
        Reflect.apply(valueSetter, input, [normalized]);
        input.dispatchEvent(inputEvent);
      } else if (contentEditable) {
        contentEditable.focus();
        contentEditable.textContent = normalized;
        contentEditable.dispatchEvent(inputEvent);
      }

      await new Promise<void>(resolve => requestAnimationFrame(() => resolve()));

      const button = document.querySelector<HTMLButtonElement>(
        '#control-panel-ctnr-box .send-btn-wrapper button.send-btn, ' +
          '#control-panel-ctnr-box .send-btn-wrapper button, ' +
          '#control-panel-ctnr-box button.send-btn, ' +
          '#control-panel-ctnr-box .bl-button--primary',
      );
      if (!button) return { ok: false, error: '没有找到直播页弹幕发送按钮' };
      if (button.disabled) {
        return { ok: false, error: '直播页弹幕发送按钮不可用，请确认账号状态和弹幕内容' };
      }

      button.click();
      emit({ type: 'danmaku-sent', content: normalized, roomId: roomId() });
      return { ok: true };
    },
  };

  observeVideo();
  reportRoom();
  checkLiveEnded();
  emit({ type: 'page-ready', roomId: roomId() });
}
