// @env node

import { BrowserWindow, session } from 'electron';

import type { Account } from '../shared/types.ts';

const LOGIN_URL = 'https://passport.bilibili.com/login';

export class AccountManager {
  private loginWindow?: BrowserWindow;

  async current(): Promise<Account | undefined> {
    const response = await session.defaultSession.fetch(
      'https://api.bilibili.com/x/web-interface/nav',
      {
        credentials: 'include',
        signal: AbortSignal.timeout(5_000),
      },
    );
    const body = (await response.json()) as {
      code: number;
      data?: { face?: string; isLogin?: boolean; mid?: number; uname?: string };
    };
    if (body.code === -101 || !body.data?.isLogin) return undefined;
    if (body.code !== 0 || !body.data.mid || !body.data.uname)
      throw new Error('无法读取 Bilibili 账号');
    return {
      face: body.data.face ?? '',
      name: body.data.uname,
      uid: body.data.mid,
    };
  }

  async login(parent: BrowserWindow): Promise<Account> {
    if (this.loginWindow && !this.loginWindow.isDestroyed()) {
      this.loginWindow.focus();
      throw new Error('登录窗口已经打开');
    }
    const window = new BrowserWindow({
      height: 720,
      parent,
      title: '登录 Bilibili',
      width: 1100,
      webPreferences: {
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true,
        session: session.defaultSession,
      },
    });
    this.loginWindow = window;
    window.setMenuBarVisibility(false);
    await window.loadURL(LOGIN_URL);
    return new Promise((resolve, reject) => {
      let settled = false;
      const timer = setInterval(() => {
        void this.current().then(account => {
          if (!account || settled) return;
          settled = true;
          clearInterval(timer);
          this.loginWindow = undefined;
          if (!window.isDestroyed()) window.close();
          resolve(account);
        });
      }, 1_500);
      window.once('closed', () => {
        this.loginWindow = undefined;
        clearInterval(timer);
        if (!settled) reject(new Error('未完成 Bilibili 登录'));
      });
    });
  }

  async logout(): Promise<void> {
    const cookies = await session.defaultSession.cookies.get({});
    await Promise.all(
      cookies
        .filter(cookie => cookie.domain?.replace(/^\./u, '').endsWith('bilibili.com'))
        .map(cookie => {
          const domain = cookie.domain?.replace(/^\./u, '') ?? 'bilibili.com';
          return session.defaultSession.cookies.remove(
            `${cookie.secure ? 'https' : 'http'}://${domain}${cookie.path ?? '/'}`,
            cookie.name,
          );
        }),
    );
  }
}
