// @env node

import { BrowserWindow, session } from 'electron';

import type { BilibiliAccount } from '../shared/types.ts';

const LOGIN_URL = 'https://passport.bilibili.com/login';

interface NavResponse {
  readonly code: number;
  readonly data?: {
    readonly face?: string;
    readonly isLogin?: boolean;
    readonly mid?: number;
    readonly uname?: string;
  };
  readonly message: string;
}

export class BilibiliAccountManager {
  private loginWindow?: BrowserWindow;

  async current(): Promise<BilibiliAccount | undefined> {
    const response = await session.defaultSession.fetch(
      'https://api.bilibili.com/x/web-interface/nav',
      {
        credentials: 'include',
        headers: { Accept: 'application/json' },
        signal: AbortSignal.timeout(5_000),
      },
    );
    if (!response.ok) throw new Error(`Bilibili account API HTTP ${response.status}`);
    const body = (await response.json()) as NavResponse;
    if (body.code === -101 || !body.data?.isLogin) return undefined;
    if (body.code !== 0 || !body.data.mid || !body.data.uname) {
      throw new Error(`Bilibili account API ${body.code}: ${body.message}`);
    }
    return {
      face: await fetchAvatarDataUrl(body.data.face),
      name: body.data.uname,
      uid: body.data.mid,
    };
  }

  async login(parent: BrowserWindow): Promise<BilibiliAccount> {
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

    return new Promise<BilibiliAccount>((resolve, reject) => {
      let settled = false;
      const finish = (account: BilibiliAccount): void => {
        if (settled) return;
        settled = true;
        clearInterval(timer);
        this.loginWindow = undefined;
        if (!window.isDestroyed()) window.close();
        resolve(account);
      };
      const inspect = async (): Promise<void> => {
        try {
          const account = await this.current();
          if (account) finish(account);
        } catch {
          // 登录跳转过程中可能暂时无法请求账号状态，继续等待即可。
        }
      };
      const timer = setInterval(() => void inspect(), 1_500);
      window.once('closed', () => {
        this.loginWindow = undefined;
        clearInterval(timer);
        if (settled) return;
        settled = true;
        void this.current().then(
          account => (account ? resolve(account) : reject(new Error('未完成 Bilibili 登录'))),
          reject,
        );
      });
      void inspect();
    });
  }
}

async function fetchAvatarDataUrl(url?: string): Promise<string> {
  if (!url) return '';
  try {
    const response = await session.defaultSession.fetch(url, {
      headers: {
        Accept: 'image/avif,image/webp,image/apng,image/*,*/*;q=0.8',
        Referer: 'https://www.bilibili.com/',
      },
      signal: AbortSignal.timeout(5_000),
    });
    if (!response.ok) return '';
    const bytes = Buffer.from(await response.arrayBuffer());
    if (bytes.byteLength > 2_000_000) return '';
    const contentType = response.headers.get('content-type')?.split(';')[0] ?? 'image/jpeg';
    return `data:${contentType};base64,${bytes.toString('base64')}`;
  } catch {
    return '';
  }
}
