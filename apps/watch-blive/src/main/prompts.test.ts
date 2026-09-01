import { describe, expect, it } from 'vite-plus/test';

import {
  BILIBILI_EMOJI_TAGS,
  COMMON_BLIVE_PROMPT,
  createInstructions,
  createRoomContextMessage,
} from './prompts.ts';

describe('watch-blive prompts', () => {
  it('注入公共弹幕规则和 emoji 白名单', () => {
    expect(COMMON_BLIVE_PROMPT).toContain('先调用且只调用一次 send_danmaku');
    expect(COMMON_BLIVE_PROMPT).toContain(BILIBILI_EMOJI_TAGS.join('、'));
    expect(COMMON_BLIVE_PROMPT).toContain('[喝彩]');
    expect(COMMON_BLIVE_PROMPT).not.toContain('最终决策输出');
  });

  it('标准模式仅返回弹幕行动结果', () => {
    const prompt = createInstructions('standard');

    expect(prompt).toContain('不主动寻找、评价或切换直播间');
    expect(prompt).toContain('{"danmakuAction":"send","reason"');
    expect(prompt).not.toContain('"confidence"');
    expect(prompt).not.toContain('"score"');
  });

  it('自主模式返回房间评分和切换决策', () => {
    const prompt = createInstructions('autonomous');

    expect(prompt).toContain('"action":"stay"');
    expect(prompt).toContain('"danmakuAction":"send"');
    expect(prompt).toContain('"confidence":0.8');
    expect(prompt).toContain('"score":75');
    expect(prompt).toContain('explore 表示结束对当前直播间的停留');
  });

  it('注入房间元数据和当前房间的已发送历史', () => {
    const prompt = createRoomContextMessage({
      canSwitch: true,
      history: [{ content: '唱得好[喝彩]', roomId: 123, sentAt: 1 }],
      room: {
        areaName: '主机游戏',
        description: '正在玩测试游戏',
        live: true,
        parentAreaName: '游戏',
        roomId: 123,
        streamerName: '测试主播',
        title: '测试直播',
        uid: 456,
      },
      startedAt: Date.now() - 5_000,
    });

    expect(prompt).toContain('测试主播（UID：456）');
    expect(prompt).toContain('正在玩测试游戏');
    expect(prompt).toContain('房间号：123');
    expect(prompt).toContain('当前允许切换：是');
    expect(prompt).toContain('唱得好[喝彩]');
  });
});
