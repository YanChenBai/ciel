import { describe, expect, it } from 'vite-plus/test';

import { createMemoryResourceId } from './resource-id.ts';

describe('createMemoryResourceId', () => {
  it('逐段编码细粒度资源标识，避免分隔符碰撞', () => {
    expect(createMemoryResourceId('blive', 'account', 123, 'room', 456)).toBe(
      'blive:account:123:room:456',
    );
    expect(createMemoryResourceId('blive', 'account:owner')).not.toBe(
      createMemoryResourceId('blive:account', 'owner'),
    );
  });

  it('拒绝空分段和非安全整数', () => {
    expect(() => createMemoryResourceId('blive', ' ')).toThrow('must not be empty');
    expect(() => createMemoryResourceId('blive', Number.NaN)).toThrow('safe integer');
    expect(() => createMemoryResourceId('blive', Number.MAX_SAFE_INTEGER + 1)).toThrow(
      'safe integer',
    );
  });
});
