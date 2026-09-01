// @env node

import { BrowserWindow, WebContentsView } from 'electron';
import { type Static, type TSchema, Type } from 'typebox';
import { Value } from 'typebox/value';

import type { ViewBounds } from '../shared/types.ts';

const sendResultSchema = Type.Object(
  { ok: Type.Boolean(), error: Type.Optional(Type.String()) },
  { additionalProperties: false },
);

export class LiveView {
  readonly view: WebContentsView;

  constructor(host: BrowserWindow) {
    this.view = new WebContentsView({
      webPreferences: {
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true,
        session: host.webContents.session,
      },
    });
    host.contentView.addChildView(this.view);
    this.view.setVisible(false);
    this.view.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
    this.view.webContents.on('did-finish-load', () => {
      void this.preparePage().catch(error => console.error('[watch-blive:live-view]', error));
    });
  }

  async open(roomId: number): Promise<void> {
    await this.view.webContents.loadURL(`https://live.bilibili.com/blanc/${roomId}`);
  }

  setBounds(bounds: ViewBounds): void {
    this.view.setBounds({
      height: Math.max(0, Math.round(bounds.height)),
      width: Math.max(0, Math.round(bounds.width)),
      x: Math.max(0, Math.round(bounds.x)),
      y: Math.max(0, Math.round(bounds.y)),
    });
  }

  setVisible(visible: boolean): void {
    this.view.setVisible(visible);
  }

  async sendDanmaku(content: string): Promise<void> {
    const source = `(() => {
      const content = ${JSON.stringify(content)};
      const input = document.querySelector('#control-panel-ctnr-box textarea, #control-panel-ctnr-box input[type="text"], #control-panel-ctnr-box [contenteditable="true"]');
      if (!input) return { ok: false, error: '没有找到弹幕输入框' };
      input.focus();
      if ('value' in input) input.value = content;
      else input.textContent = content;
      input.dispatchEvent(new InputEvent('input', { bubbles: true, data: content, inputType: 'insertText' }));
      const button = document.querySelector('#control-panel-ctnr-box button.send-btn, #control-panel-ctnr-box .send-btn-wrapper button, #control-panel-ctnr-box .bl-button--primary');
      if (!(button instanceof HTMLButtonElement) || button.disabled) return { ok: false, error: '弹幕发送按钮不可用' };
      button.click();
      return { ok: true };
    })()`;
    const result = await this.execute(source, sendResultSchema, true);
    if (!result.ok) throw new Error(result.error ?? '发送弹幕失败');
  }

  destroy(): void {
    this.view.webContents.close();
  }

  private async preparePage(): Promise<void> {
    await this.view.webContents.executeJavaScript(`(() => {
      document.body.classList.add('hide-aside-area');
      document.body.style.overflow = 'hidden';
      const style = document.createElement('style');
      style.textContent = '#sidebar-vm,.aside-area,.side-bar-cntr,#gift-control-vm{display:none!important}.player-section{width:100%!important}';
      document.head.append(style);
      globalThis.livePlayer?.setFullscreenStatus?.(1);
      return true;
    })()`);
  }

  private async execute<T extends TSchema>(
    source: string,
    schema: T,
    userGesture = false,
  ): Promise<Static<T>> {
    const value: unknown = await this.view.webContents.executeJavaScript(source, userGesture);
    if (!Value.Check(schema, value)) {
      const issue = Value.Errors(schema, value)[0];
      throw new TypeError(`直播页面返回值无效${issue ? `: ${issue.message}` : ''}`);
    }
    return value;
  }
}
