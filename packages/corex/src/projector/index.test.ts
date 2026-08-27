import { describe, expect, it } from 'vite-plus/test';

import { defineProjector } from './index.ts';

describe('defineProjector', () => {
  it('创建可复用且具有独立标识的 Projector', () => {
    const create = () =>
      defineProjector({
        name: 'text',
        project: () => [{ type: 'text' as const, text: 'hello' }],
      });
    const first = create();
    const second = create();

    expect(first.name).toBe('text');
    expect(first.project).toBeTypeOf('function');
    expect(first.id).not.toBe(second.id);
  });
});
