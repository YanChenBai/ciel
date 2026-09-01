// @env node

import type { LiveArea, RoomInfo } from '../shared/types.ts';

interface ApiResponse<T> {
  readonly code: number;
  readonly message: string;
  readonly data?: T;
}

export interface RoomCandidate {
  readonly roomId: number;
  readonly streamerName: string;
  readonly title: string;
}

export async function fetchAreas(): Promise<readonly LiveArea[]> {
  const data = await request<{ data?: readonly AreaGroup[] }>(
    'https://api.live.bilibili.com/xlive/web-interface/v1/index/getWebAreaList?source_id=2',
  );
  return (data.data ?? []).flatMap(group =>
    validId(group.id) && group.name
      ? [
          {
            id: group.id,
            name: group.name,
            children: (group.list ?? []).flatMap(area => {
              const id = Number(area.id);
              return validId(id) && area.name ? [{ id, name: area.name, children: [] }] : [];
            }),
          },
        ]
      : [],
  );
}

export async function fetchRoom(roomId: number): Promise<RoomInfo> {
  const room = await request<{
    area_name?: string;
    description?: string;
    live_status?: number;
    parent_area_name?: string;
    room_id?: number;
    title?: string;
    uid?: number;
  }>(`https://api.live.bilibili.com/room/v1/Room/get_info?id=${roomId}`);
  const uid = room.uid ?? 0;
  const users = uid
    ? await request<Record<string, { uname?: string }>>(
        `https://api.live.bilibili.com/room/v1/Room/get_status_info_by_uids?uids[]=${uid}`,
      )
    : {};
  return {
    areaName: room.area_name ?? '未知',
    description: room.description ?? '',
    live: room.live_status === 1,
    parentAreaName: room.parent_area_name ?? '未知',
    roomId: room.room_id ?? roomId,
    streamerName: users[String(uid)]?.uname ?? `UID ${uid}`,
    title: room.title ?? `直播间 ${roomId}`,
    uid,
  };
}

export async function fetchRooms(areaId: number, page = 1): Promise<readonly RoomCandidate[]> {
  const query = new URLSearchParams({
    area_id: '0',
    page: String(page),
    page_size: '20',
    parent_area_id: String(areaId),
    platform: 'web',
    sort_type: 'online',
  });
  const data = await request<{
    list?: readonly { roomid?: number; title?: string; uname?: string }[];
  }>(`https://api.live.bilibili.com/room/v3/area/getRoomList?${query}`);
  return (data.list ?? []).flatMap(item =>
    validId(item.roomid) && item.title
      ? [{ roomId: item.roomid, streamerName: item.uname ?? '未知主播', title: item.title }]
      : [],
  );
}

export async function fetchFlvUrl(roomId: number): Promise<string> {
  const query = new URLSearchParams({
    room_id: String(roomId),
    protocol: '0,1',
    format: '0,1,2',
    codec: '0,1,2',
    qn: '10000',
    platform: 'web',
    ptype: '8',
  });
  const data = await request<{
    live_status?: number;
    playurl_info?: { playurl?: { stream?: readonly Stream[] } };
  }>(`https://api.live.bilibili.com/xlive/web-room/v2/index/getRoomPlayInfo?${query}`);
  if (data.live_status !== 1) throw new Error(`直播间 ${roomId} 当前未开播`);
  const stream = data.playurl_info?.playurl?.stream?.find(
    item => item.protocol_name === 'http_stream',
  );
  const format = stream?.format?.find(item => item.format_name === 'flv');
  const codec = format?.codec?.find(item => item.codec_name === 'avc') ?? format?.codec?.[0];
  const info = codec?.url_info?.[0];
  if (!codec?.base_url || !info?.host) throw new Error('Bilibili 未返回 FLV 地址');
  return `${info.host}${codec.base_url}${info.extra ?? ''}`;
}

interface AreaGroup {
  readonly id?: number;
  readonly name?: string;
  readonly list?: readonly { readonly id?: string; readonly name?: string }[];
}

interface Stream {
  readonly protocol_name?: string;
  readonly format?: readonly {
    readonly format_name?: string;
    readonly codec?: readonly {
      readonly codec_name?: string;
      readonly base_url?: string;
      readonly url_info?: readonly { readonly host?: string; readonly extra?: string }[];
    }[];
  }[];
}

async function request<T>(url: string): Promise<T> {
  const response = await fetch(url, {
    headers: { Accept: 'application/json', Referer: 'https://live.bilibili.com/' },
    signal: AbortSignal.timeout(10_000),
  });
  if (!response.ok) throw new Error(`Bilibili API HTTP ${response.status}`);
  const body = (await response.json()) as ApiResponse<T>;
  if (body.code !== 0 || !body.data) throw new Error(`Bilibili API ${body.code}: ${body.message}`);
  return body.data;
}

function validId(value: number | undefined): value is number {
  return Number.isSafeInteger(value) && (value ?? 0) > 0;
}
