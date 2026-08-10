// @env node

import { MockLanguageModelV3 } from 'ai/test';
import { describe, expect, it } from 'vite-plus/test';

import { Memory } from './memory.ts';

function createModel(text = 'ok'): MockLanguageModelV3 {
  return new MockLanguageModelV3({
    doGenerate: {
      content: [{ type: 'text', text }],
      finishReason: { unified: 'stop', raw: undefined },
      usage: {
        inputTokens: { total: 1, noCache: 1, cacheRead: 0, cacheWrite: 0 },
        outputTokens: { total: 1, text: 1, reasoning: 0 },
      },
      warnings: [],
    },
  });
}

describe('Memory', () => {
  it('分别保存长期记忆和 main Agent 生成的情景记忆', async () => {
    const memory = new Memory({ path: ':memory:', model: createModel() });
    await memory.rememberLongTerm({
      name: '用户偏好',
      description: '值得跨场景保留的稳定信息',
      time: { startAt: new Date(1), endAt: new Date(1) },
      content: { type: 'text', text: '喜欢简洁回答' },
    });

    await memory.rememberEpisode({
      name: '情景',
      description: 'main Agent 对当时发生内容的总结',
      time: { startAt: new Date(2), endAt: new Date(2) },
      content: { type: 'text', text: '用户刚刚说了你好' },
    });

    const recalled = await memory.getContext({ longTermLimit: 1, episodicLimit: 10 });
    expect(recalled.entries).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: 'long-term',
          content: { type: 'text', text: '喜欢简洁回答' },
        }),
        expect.objectContaining({
          kind: 'episodic',
          description: 'main Agent 对当时发生内容的总结',
          content: { type: 'text', text: '用户刚刚说了你好' },
        }),
      ]),
    );
    expect(recalled.entries.filter(entry => entry.kind === 'episodic')).toHaveLength(1);
    await memory.close();
  });

  it('保留 Mastra 原生历史召回能力供内置工具使用', async () => {
    const memory = new Memory({ path: ':memory:', model: createModel() });
    await memory.rememberLongTerm({
      name: '事件',
      description: '过去发生的事情',
      time: { startAt: new Date(2), endAt: new Date(2) },
      content: { type: 'text', text: '事件内容' },
    });

    const result = await memory.recallHistory({
      mode: 'messages',
      anchor: 'end',
      limit: 10,
      detail: 'high',
    });

    expect(JSON.stringify(result)).toContain('事件内容');
    await memory.close();
  });
});
