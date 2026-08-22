import { describe, expect, it } from 'vite-plus/test';

import { createRoomContextMessage } from './prompts.ts';

describe('createRoomContextMessage', () => {
  it('injects room metadata and recently sent danmaku', () => {
    const message = createRoomContextMessage({
      canSwitch: true,
      history: [{ content: '唱得好[喝彩]', roomId: 123, sentAt: 1 }],
      room: {
        areaName: '虚拟主播',
        description: '测试简介',
        live: true,
        parentAreaName: '娱乐',
        roomId: 123,
        streamerName: '测试主播',
        title: '测试直播',
        uid: 456,
      },
      startedAt: Date.now() - 60_000,
    });

    expect(message).toContain('测试主播（UID：456）');
    expect(message).toContain('房间号：123');
    expect(message).toContain('当前允许切换：是');
    expect(message).toContain('唱得好[喝彩]');
  });
});
