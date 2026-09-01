import { describe, expect, it } from 'vite-plus/test';

import { ffmpegArgs } from './media.ts';

describe('ffmpegArgs', () => {
  it('为 Bilibili CDN 设置浏览器请求头与重连策略', () => {
    const args = ffmpegArgs(24_680, 'https://cdn.example.test/live.flv');

    expect(args[args.indexOf('-user_agent') + 1]).toContain('Mozilla/5.0');
    expect(args[args.indexOf('-referer') + 1]).toBe('https://live.bilibili.com/24680');
    expect(args[args.indexOf('-headers') + 1]).toBe('Origin: https://live.bilibili.com\r\n');
    expect(args[args.indexOf('-reconnect_on_http_error') + 1]).toBe('4xx,5xx');
  });
});
