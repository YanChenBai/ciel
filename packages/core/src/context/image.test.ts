// @env node

import { describe, expect, it } from 'vite-plus/test';

import { calculateImageTokens } from './image.ts';

describe('calculateImageTokens', () => {
  it('按 patch 和空间合并规则计算常规图片', () => {
    expect(calculateImageTokens(1920, 1080)).toBe(2040);
  });

  it('按最小和最大像素规则缩放图片', () => {
    expect(calculateImageTokens(32, 32)).toBe(1);
    expect(calculateImageTokens(10_000, 10_000)).toBe(8100);
  });

  it('与 Python round 一样对中点取最近偶数', () => {
    expect(calculateImageTokens(336, 320)).toBe(100);
  });
});
