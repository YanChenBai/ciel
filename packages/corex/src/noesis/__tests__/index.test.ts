import { expect, test } from 'vite-plus/test';

import { ModuleType } from '../../types/index.ts';
import { defineNoesis } from '../index.ts';

test('创建具有独立标识的 Noesis 模块', () => {
  const first = defineNoesis({
    name: 'first',
    description: 'First thinker',
    setup() {},
  });
  const second = defineNoesis({
    name: 'second',
    description: 'Second thinker',
    setup() {},
  });

  expect(first).toMatchObject({
    type: ModuleType.Noesis,
    name: 'first',
    description: 'First thinker',
  });
  expect(first.id).not.toBe(second.id);
});
