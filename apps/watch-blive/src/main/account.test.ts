// @env node

import { beforeEach, describe, expect, it, vi } from 'vite-plus/test';

const electron = vi.hoisted(() => ({
  fetch: vi.fn(),
  get: vi.fn(),
  remove: vi.fn(() => Promise.resolve()),
}));

vi.mock('electron', () => ({
  BrowserWindow: vi.fn(),
  session: {
    defaultSession: {
      cookies: { get: electron.get, remove: electron.remove },
      fetch: electron.fetch,
    },
  },
}));

const { AccountManager } = await import('./account.ts');

beforeEach(() => vi.clearAllMocks());

describe('AccountManager.sendDanmaku', () => {
  it('使用 session 中的 CSRF Cookie 调用真实弹幕 API', async () => {
    electron.get.mockResolvedValue([{ name: 'bili_jct', value: 'csrf-token' }]);
    electron.fetch.mockResolvedValue(Response.json({ code: 0, message: 'ok', data: {} }));

    await new AccountManager().sendDanmaku(24_680, '晚上好');

    expect(electron.fetch).toHaveBeenCalledTimes(1);
    const [url, options] = electron.fetch.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://api.live.bilibili.com/msg/send');
    expect(options.method).toBe('POST');
    expect(options.headers).toEqual({ Referer: 'https://live.bilibili.com/24680' });
    expect(options.body).toBeInstanceOf(FormData);
    const body = options.body as FormData;
    expect(body.get('csrf')).toBe('csrf-token');
    expect(body.get('csrf_token')).toBe('csrf-token');
    expect(body.get('msg')).toBe('晚上好');
    expect(body.get('roomid')).toBe('24680');
  });

  it('缺少 CSRF Cookie 时拒绝发送', async () => {
    electron.get.mockResolvedValue([]);

    await expect(new AccountManager().sendDanmaku(24_680, '晚上好')).rejects.toThrow('bili_jct');
    expect(electron.fetch).not.toHaveBeenCalled();
  });
});
