import { createMemoryResourceId } from '@ciels/core';
import type { MemoryScope } from '@ciels/core';

import type { LiveRoomInfo } from '../shared/types.ts';

export function createBliveMemoryResourceId(accountUid?: number): string {
  return createMemoryResourceId('blive-desktop', 'account', accountUid ?? 'anonymous');
}

export function createBliveRoomMemoryScope(room: LiveRoomInfo): MemoryScope {
  return {
    id: `room:${room.roomId}`,
    label: `直播间 ${room.roomId}（${room.streamerName} / UID ${room.uid}）`,
  };
}
