// @env node

import type { LiveRoomInfo } from '../shared/types.ts';

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
    headers: { Accept: 'application/json' },
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
