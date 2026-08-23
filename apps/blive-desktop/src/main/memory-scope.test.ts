import { describe, expect, it } from 'vite-plus/test';

import { createBliveMemoryResourceId, createBliveRoomMemoryScope } from './memory-scope.ts';

describe('createBliveMemoryResourceId', () => {
  it('按 Bilibili 账号隔离跨直播间共享的记忆', () => {
    expect(createBliveMemoryResourceId(123)).toBe('blive-desktop:account:123');
    expect(createBliveMemoryResourceId(456)).toBe('blive-desktop:account:456');
  });

  it('未登录状态使用独立的匿名记忆', () => {
    expect(createBliveMemoryResourceId()).toBe('blive-desktop:account:anonymous');
  });
});

describe('createBliveRoomMemoryScope', () => {
  it('使用稳定 roomId 隔离并保留主播来源', () => {
    expect(
      createBliveRoomMemoryScope({
        areaName: '虚拟主播',
        description: '',
        live: true,
        parentAreaName: '娱乐',
        roomId: 123,
        streamerName: '测试主播',
        title: '今天聊天',
        uid: 456,
      }),
    ).toEqual({
      id: 'room:123',
      label: '直播间 123（测试主播 / UID 456）',
    });
  });
});
