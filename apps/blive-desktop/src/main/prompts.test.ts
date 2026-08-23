import { describe, expect, it } from 'vite-plus/test';

import {
  AUTONOMOUS_MODE_PROMPT,
  COMMON_BLIVE_PROMPT,
  createRoomContextMessage,
  EXPLORE_LIVE_ROOMS_PROMPT,
} from './prompts.ts';

describe('直播互动提示词', () => {
  it('要求弹幕优先使用昵称，但不禁用其他自然称谓', () => {
    expect(COMMON_BLIVE_PROMPT).toContain('优先使用当前直播间信息中的昵称');
    expect(COMMON_BLIVE_PROMPT).toContain('不要每条都强行称呼');
    expect(COMMON_BLIVE_PROMPT).toContain('可以省略称呼或使用“主播”等自然称谓');
    expect(COMMON_BLIVE_PROMPT).not.toContain('禁止直接称为“主播”');
    expect(COMMON_BLIVE_PROMPT).not.toContain('省略称呼或使用“你”');
  });

  it('使用个人化但由语境约束的弹幕表达风格', () => {
    expect(COMMON_BLIVE_PROMPT).toContain('熟人式陪伴');
    expect(COMMON_BLIVE_PROMPT).toContain('通常控制在 8 个字左右');
    expect(COMMON_BLIVE_PROMPT).toContain('“啊？”“啥意思？”“难绷”“不赖”');
    expect(COMMON_BLIVE_PROMPT).toContain('“喵”“oi”“辣么”“罢了”');
    expect(COMMON_BLIVE_PROMPT).toContain('“咕咕嘎嘎”');
    expect(COMMON_BLIVE_PROMPT).toContain('半认真半整活');
    expect(COMMON_BLIVE_PROMPT).toContain('只在符合当前语境时选用');
  });
});

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
