// @env node

import { EventEmitter } from 'node:events';

import { BrowserWindow, ipcMain, WebContentsView } from 'electron';

import { IPC } from '../shared/ipc.ts';
import type { LivePageEvent, LiveViewBounds } from '../shared/types.ts';
import { LIVE_PAGE_BRIDGE_SOURCE } from './page-script.ts';

interface LivePageEvents {
  event: [LivePageEvent];
}

export class LivePage extends EventEmitter<LivePageEvents> {
  readonly view: WebContentsView;
  private roomId?: number;

  constructor(host: BrowserWindow, preload: string) {
    super();
    this.view = new WebContentsView({
      webPreferences: {
        contextIsolation: true,
        nodeIntegration: false,
        preload,
        sandbox: false,
      },
    });
    host.contentView.addChildView(this.view);
    this.view.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
    this.view.webContents.on('did-finish-load', () => {
      void this.inject();
    });
    ipcMain.on(IPC.pageEvent, this.handlePageEvent);
  }

  async open(roomId: number): Promise<void> {
    this.roomId = roomId;
    await this.view.webContents.loadURL(`https://live.bilibili.com/blanc/${roomId}`);
  }

  setBounds(bounds: LiveViewBounds): void {
    this.view.setBounds({
      height: Math.max(0, Math.round(bounds.height)),
      width: Math.max(0, Math.round(bounds.width)),
      x: Math.max(0, Math.round(bounds.x)),
      y: Math.max(0, Math.round(bounds.y)),
    });
  }

  async sendDanmaku(content: string): Promise<void> {
    const argument = JSON.stringify(content);
    const result = (await this.view.webContents.executeJavaScript(
      `globalThis.__cielBliveBridge?.sendDanmaku(${argument}) ?? Promise.resolve({ ok: false, error: '页面脚本尚未就绪' })`,
      true,
    )) as { error?: string; ok: boolean };
    if (!result.ok) throw new Error(result.error ?? '发送弹幕失败');
  }

  destroy(): void {
    ipcMain.removeListener(IPC.pageEvent, this.handlePageEvent);
    this.view.webContents.close();
    this.removeAllListeners();
  }

  private readonly handlePageEvent = (event: Electron.IpcMainEvent, value: LivePageEvent): void => {
    if (event.sender !== this.view.webContents || !isLivePageEvent(value)) return;
    const roomId = eventRoomId(value);
    if (roomId !== undefined && roomId !== this.roomId) return;
    this.emit('event', value);
  };

  private async inject(): Promise<void> {
    if (!this.view.webContents.getURL().startsWith('https://live.bilibili.com/')) return;
    await this.view.webContents.executeJavaScript(LIVE_PAGE_BRIDGE_SOURCE, true);
  }
}

function eventRoomId(event: LivePageEvent): number | undefined {
  return event.type === 'room-info' ? event.info.roomId : event.roomId;
}

function isLivePageEvent(value: unknown): value is LivePageEvent {
  if (!value || typeof value !== 'object') return false;
  const event = value as Record<string, unknown>;
  if (typeof event.time !== 'number' || !Number.isFinite(event.time)) return false;
  if (event.type === 'room-info') return Boolean(event.info && typeof event.info === 'object');
  if (event.type === 'danmaku-sent') return typeof event.content === 'string';
  return event.type === 'live-ended' || event.type === 'page-ready';
}
