// @env node

import { BrowserWindow, session } from 'electron';

export class LiveRoomWindow {
  private roomId?: number;
  private window?: BrowserWindow;

  constructor(private readonly parent: BrowserWindow) {}

  async open(roomId: number): Promise<void> {
    const current = this.window;

    if (current && !current.isDestroyed() && this.roomId === roomId) {
      current.show();
      current.focus();
      return;
    }

    const window =
      current && !current.isDestroyed()
        ? current
        : new BrowserWindow({
            backgroundColor: '#000000',
            height: 810,
            minHeight: 540,
            minWidth: 960,
            parent: this.parent,
            show: false,
            title: 'Bilibili 直播',
            width: 1440,
            webPreferences: {
              backgroundThrottling: false,
              contextIsolation: true,
              nodeIntegration: false,
              sandbox: true,
              session: session.defaultSession,
            },
          });

    if (window !== current) {
      this.window = window;
      window.setMenuBarVisibility(false);
      window.once('closed', () => {
        if (this.window !== window) return;
        this.window = undefined;
        this.roomId = undefined;
      });
    }

    try {
      await window.loadURL(`https://live.bilibili.com/${roomId}`);
      if (window.isDestroyed()) return;
      this.roomId = roomId;
      window.show();
      window.focus();
    } catch (error) {
      if (!window.isDestroyed()) window.close();
      throw error;
    }
  }

  close(): void {
    const window = this.window;
    this.window = undefined;
    this.roomId = undefined;
    if (window && !window.isDestroyed()) window.close();
  }
}
