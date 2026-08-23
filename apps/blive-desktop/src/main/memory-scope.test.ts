import { describe, expect, it } from 'vite-plus/test';

import { createBliveMemoryResourceId } from './memory-scope.ts';

describe('createBliveMemoryResourceId', () => {
  it('按 Bilibili 账号隔离跨直播间共享的记忆', () => {
    expect(createBliveMemoryResourceId(123)).toBe('blive-desktop:account:123');
    expect(createBliveMemoryResourceId(456)).toBe('blive-desktop:account:456');
  });

  it('未登录状态使用独立的匿名记忆', () => {
    expect(createBliveMemoryResourceId()).toBe('blive-desktop:account:anonymous');
  });
});
