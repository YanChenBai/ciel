// @env node

import { afterEach, describe, expect, it, vi } from 'vite-plus/test';

import { fetchLiveAreas, fetchLiveRoomsByArea } from './catalog-api.ts';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('Bilibili API', () => {
  it('normalizes the live area tree', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        response({
          data: {
            data: [
              {
                id: 9,
                list: [{ id: '371', name: '虚拟日常' }],
                name: '虚拟主播',
              },
            ],
          },
        }),
      ),
    );

    await expect(fetchLiveAreas()).resolves.toEqual([
      { areas: [{ id: 371, name: '虚拟日常' }], id: 9, name: '虚拟主播' },
    ]);
  });

  it('uses area ids to fetch and normalize live room candidates', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      response({
        data: {
          count: 41,
          list: [{ roomid: 123, title: '正在唱歌', uname: '夏尔' }],
        },
      }),
    );
    vi.stubGlobal('fetch', fetchMock);

    await expect(fetchLiveRoomsByArea(9, 371, 2, 20)).resolves.toEqual({
      candidates: [{ anchor: '夏尔', roomId: 123, title: '正在唱歌' }],
      hasMore: true,
    });
    expect(fetchMock).toHaveBeenCalledOnce();
    const url = new URL(String(fetchMock.mock.calls[0]?.[0]));
    expect(Object.fromEntries(url.searchParams)).toMatchObject({
      area_id: '371',
      page: '2',
      page_size: '20',
      parent_area_id: '9',
    });
  });
});

function response(value: Record<string, unknown>): Response {
  return {
    json: () => Promise.resolve({ code: 0, message: 'success', ...value }),
    ok: true,
  } as Response;
}
