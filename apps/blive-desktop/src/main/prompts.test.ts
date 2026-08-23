import { describe, expect, it } from 'vite-plus/test';

import {
  AUTONOMOUS_MODE_PROMPT,
  createRoomContextMessage,
  EXPLORE_LIVE_ROOMS_PROMPT,
} from './prompts.ts';

describe('自主探索提示词', () => {
  it('把不感兴定义为重新搜索并要求真正打开候选房间', () => {
    expect(AUTONOMOUS_MODE_PROMPT).toContain('explore');
    expect(AUTONOMOUS_MODE_PROMPT).toContain('重新搜索');
    expect(AUTONOMOUS_MODE_PROMPT).toContain('80～100');
    expect(AUTONOMOUS_MODE_PROMPT).toContain('连续多轮评分');
    expect(EXPLORE_LIVE_ROOMS_PROMPT).toContain('必须先调用 list_live_rooms');
    expect(EXPLORE_LIVE_ROOMS_PROMPT).toContain('必须调用 open_live_room');
  });
});

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
