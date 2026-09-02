// @env node

import { describe, expect, it } from 'vite-plus/test';

import { LivePlayback } from './playback.ts';

describe('LivePlayback', () => {
  it('把订阅前后的 FFmpeg 数据连续交给自定义协议响应', async () => {
    const playback = new LivePlayback();
    const url = playback.open();
    playback.write(Buffer.from('init'));

    const response = playback.handle(new Request(url));
    playback.write(Buffer.from('media'));
    playback.close();

    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toBe('video/mp4');
    expect(Buffer.from(await response.arrayBuffer()).toString()).toBe('initmedia');
  });

  it('切换 generation 后拒绝旧直播流地址', () => {
    const playback = new LivePlayback();
    const previous = playback.open();
    const current = playback.open();

    expect(playback.handle(new Request(previous)).status).toBe(404);
    expect(playback.handle(new Request(current)).status).toBe(200);
    playback.close();
  });
});
