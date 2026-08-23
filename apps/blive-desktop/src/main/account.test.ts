// @env node

import { beforeEach, describe, expect, it, vi } from 'vite-plus/test';

const electron = vi.hoisted(() => ({
  clearStorageData: vi.fn(() => Promise.resolve()),
  get: vi.fn(() =>
    Promise.resolve([
      {
        domain: '.bilibili.com',
        name: 'SESSDATA',
        path: '/',
        sameSite: 'lax',
        secure: true,
        value: 'secret',
      },
      {
        domain: 'live.bilibili.com',
        name: 'LIVE_BUVID',
        path: '/room',
        sameSite: 'lax',
        secure: false,
        value: 'live',
      },
      {
        domain: '.example.com',
        name: 'unrelated',
        path: '/',
        sameSite: 'lax',
        secure: true,
        value: 'keep',
      },
    ]),
  ),
  remove: vi.fn(() => Promise.resolve()),
}));

vi.mock('electron', () => ({
  BrowserWindow: vi.fn(),
  session: {
    defaultSession: {
      clearStorageData: electron.clearStorageData,
      cookies: {
        get: electron.get,
        remove: electron.remove,
      },
    },
  },
}));

const { BilibiliAccountManager } = await import('./account.ts');

beforeEach(() => vi.clearAllMocks());

describe('BilibiliAccountManager.logout', () => {
  it('只移除 Bilibili Cookie，并清理相关来源的本地登录状态', async () => {
    await new BilibiliAccountManager().logout();

    expect(electron.remove).toHaveBeenCalledTimes(2);
    expect(electron.remove).toHaveBeenCalledWith('https://bilibili.com/', 'SESSDATA');
    expect(electron.remove).toHaveBeenCalledWith('http://live.bilibili.com/room', 'LIVE_BUVID');
    expect(electron.clearStorageData).toHaveBeenCalledTimes(3);
    expect(electron.clearStorageData).toHaveBeenCalledWith({
      origin: 'https://live.bilibili.com',
      storages: ['localstorage'],
    });
  });
});
