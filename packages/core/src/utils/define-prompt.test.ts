import { describe, expect, it } from 'vite-plus/test';

import { definePrompt } from './define-prompt.ts';

describe('definePrompt', () => {
  it('移除首尾空行与公共缩进', () => {
    expect(
      definePrompt(`
        第一行
          第二行
        第三行
      `),
    ).toBe('第一行\n  第二行\n第三行');
  });

  it('按换行拼接多个提示词片段', () => {
    expect(definePrompt('第一段', '第二段')).toBe('第一段\n第二段');
  });
});
