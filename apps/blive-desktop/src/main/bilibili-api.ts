// @env node

import type { BilibiliLiveAreaGroup, LiveRoomCandidate, LiveRoomInfo } from '../shared/types.ts';

interface BilibiliResponse<T> {
  readonly code: number;
  readonly message: string;
  readonly data?: T;
}

interface RoomInfoResponse {
  readonly area_name?: string;
  readonly cover?: string;
  readonly description?: string;
  readonly live_status?: number;
  readonly parent_area_name?: string;
  readonly room_id?: number;
  readonly title?: string;
  readonly uid?: number;
}

interface UserInfoResponse {
  readonly uid?: number;
  readonly uname?: string;
}

interface AreaResponse {
  readonly data?: readonly AreaGroupResponse[];
}

interface AreaGroupResponse {
  readonly id?: number;
  readonly list?: readonly AreaItemResponse[];
  readonly name?: string;
}

interface AreaItemResponse {
  readonly id?: string;
  readonly name?: string;
}

interface RoomListResponse {
  readonly count?: number;
  readonly list?: readonly RoomListItemResponse[];
}

interface RoomListItemResponse {
  readonly roomid?: number;
  readonly title?: string;
  readonly uname?: string;
}

export interface LiveRoomCandidatePage {
  readonly candidates: readonly LiveRoomCandidate[];
  readonly hasMore: boolean;
}

export async function fetchLiveAreas(): Promise<readonly BilibiliLiveAreaGroup[]> {
  const result = await request<AreaResponse>(
    'https://api.live.bilibili.com/xlive/web-interface/v1/index/getWebAreaList?source_id=2',
  );
  return (result.data ?? []).flatMap(group => {
    if (!isPositiveInteger(group.id) || !group.name?.trim()) return [];
    return [
      {
        areas: (group.list ?? []).flatMap(area => {
          const id = Number(area.id);
          return isPositiveInteger(id) && area.name?.trim() ? [{ id, name: area.name.trim() }] : [];
        }),
        id: group.id,
        name: group.name.trim(),
      },
    ];
  });
}

export async function fetchLiveRoomsByArea(
  parentAreaId: number,
  areaId: number,
  page: number,
  limit: number,
): Promise<LiveRoomCandidatePage> {
  assertPositiveInteger(parentAreaId, 'parentAreaId');
  if (!Number.isSafeInteger(areaId) || areaId < 0) {
    throw new Error('areaId must be a non-negative safe integer');
  }
  assertPositiveInteger(page, 'page');
  assertPositiveInteger(limit, 'limit');
  const query = new URLSearchParams({
    area_id: String(areaId),
    page: String(page),
    page_size: String(limit),
    parent_area_id: String(parentAreaId),
    platform: 'web',
    sort_type: 'online',
  });
  const result = await request<RoomListResponse>(
    `https://api.live.bilibili.com/room/v3/area/getRoomList?${query}`,
  );
  const candidates = (result.list ?? []).flatMap(room =>
    isPositiveInteger(room.roomid) && room.title?.trim()
      ? [
          {
            anchor: room.uname?.trim() || '未知主播',
            roomId: room.roomid,
            title: room.title.trim(),
          },
        ]
      : [],
  );
  return {
    candidates,
    hasMore: page * limit < (result.count ?? 0),
  };
}

export async function fetchLiveRoomInfo(roomId: number): Promise<LiveRoomInfo> {
  assertRoomId(roomId);
  const room = await request<RoomInfoResponse>(
    `https://api.live.bilibili.com/room/v1/Room/get_info?id=${roomId}`,
  );
  const resolvedRoomId = room.room_id ?? roomId;
  const uid = room.uid ?? 0;
  const users = uid
    ? await request<Record<string, UserInfoResponse>>(
        `https://api.live.bilibili.com/room/v1/Room/get_status_info_by_uids?uids[]=${uid}`,
      )
    : {};
  const user = users[String(uid)];
  return {
    areaName: room.area_name ?? '未知',
    ...(room.cover ? { cover: room.cover } : {}),
    description: room.description ?? '',
    live: room.live_status === 1,
    parentAreaName: room.parent_area_name ?? '未知',
    roomId: resolvedRoomId,
    streamerName: user?.uname ?? `UID ${uid}`,
    title: room.title ?? `直播间 ${resolvedRoomId}`,
    uid,
  };
}

async function request<T>(url: string): Promise<T> {
  const response = await fetch(url, {
    headers: {
      Accept: 'application/json',
      Origin: 'https://live.bilibili.com',
      Referer: 'https://live.bilibili.com/',
      'User-Agent': 'Mozilla/5.0',
    },
    signal: AbortSignal.timeout(10_000),
  });
  if (!response.ok) throw new Error(`Bilibili API HTTP ${response.status}`);
  const body = (await response.json()) as BilibiliResponse<T>;
  if (body.code !== 0 || !body.data) {
    throw new Error(`Bilibili API ${body.code}: ${body.message}`);
  }
  return body.data;
}

function assertRoomId(roomId: number): void {
  if (!Number.isSafeInteger(roomId) || roomId <= 0) {
    throw new Error('roomId must be a positive safe integer');
  }
}

function assertPositiveInteger(value: number, name: string): void {
  if (!isPositiveInteger(value)) throw new Error(`${name} must be a positive safe integer`);
}

function isPositiveInteger(value: number | undefined): value is number {
  return Number.isSafeInteger(value) && (value ?? 0) > 0;
}
