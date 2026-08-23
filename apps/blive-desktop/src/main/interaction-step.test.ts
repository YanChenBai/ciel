import { describe, expect, it } from 'vite-plus/test';

import { prepareInteractionStep } from './interaction-step.ts';

describe('prepareInteractionStep', () => {
  it('允许先召回，并在召回后强制完成弹幕互动', () => {
    expect(prepareInteractionStep([])).toEqual({
      activeTools: ['memory_recall', 'send_danmaku'],
      toolChoice: 'required',
    });
    expect(prepareInteractionStep([{ toolCalls: [{ toolName: 'memory_recall' }] }])).toEqual({
      activeTools: ['send_danmaku'],
      toolChoice: { toolName: 'send_danmaku', type: 'tool' },
    });
  });

  it('互动后允许更新一次记忆，然后结束工具循环', () => {
    const sent = { toolCalls: [{ toolName: 'send_danmaku' }] };
    expect(prepareInteractionStep([sent])).toEqual({
      activeTools: ['memory_update'],
      toolChoice: 'auto',
    });
    expect(prepareInteractionStep([sent, { toolCalls: [{ toolName: 'memory_update' }] }])).toEqual({
      activeTools: [],
      toolChoice: 'none',
    });
  });
});
