import { afterEach, describe, expect, it, vi } from 'vite-plus/test';

import { fetchBilibiliFlvUrl, RoomNotLiveError } from '../src/index.ts';

afterEach(() => vi.unstubAllGlobals());

describe('fetchBilibiliFlvUrl', () => {
  it('优先解析 AVC FLV 播放地址', async () => {
    const request = vi.fn(async (_input: string | URL | Request) =>
      Response.json({
        code: 0,
        message: 'ok',
        data: {
          live_status: 1,
          playurl_info: {
            playurl: {
              stream: [
                {
                  protocol_name: 'http_stream',
                  format: [
                    {
                      format_name: 'flv',
                      codec: [
                        {
                          codec_name: 'avc',
                          base_url: '/live.flv',
                          url_info: [{ host: 'https://cdn.example.test', extra: '?token=1' }],
                        },
                      ],
                    },
                  ],
                },
              ],
            },
          },
        },
      }),
    );
    vi.stubGlobal('fetch', request);

    await expect(fetchBilibiliFlvUrl(123)).resolves.toBe(
      'https://cdn.example.test/live.flv?token=1',
    );
    const url = request.mock.calls[0]![0] as URL;
    expect(url.searchParams.get('room_id')).toBe('123');
    expect(url.searchParams.get('qn')).toBe('10000');
  });

  it('明确区分未开播房间', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        Response.json({ code: 0, message: 'ok', data: { live_status: 0, playurl_info: null } }),
      ),
    );

    await expect(fetchBilibiliFlvUrl(123)).rejects.toBeInstanceOf(RoomNotLiveError);
  });

  it('非暂时性 HTTP 错误不重试', async () => {
    const request = vi.fn(async () => new Response('bad request', { status: 400 }));
    vi.stubGlobal('fetch', request);

    await expect(fetchBilibiliFlvUrl(123, { retryLimit: 3 })).rejects.toThrow(
      'Bilibili API HTTP 400',
    );
    expect(request).toHaveBeenCalledOnce();
  });
});
