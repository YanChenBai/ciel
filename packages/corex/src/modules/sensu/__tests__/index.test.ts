import { expect, test } from 'vite-plus/test';

import { defineSensu } from '../index.ts';

test('创建具有独立标识的 Sensu', () => {
  const first = defineSensu({
    name: 'reader',
    description: 'Reads signals',
    setup() {},
  });
  const second = defineSensu({
    name: 'reader',
    description: 'Reads signals',
    setup() {},
  });

  expect(first.id).not.toBe(second.id);
  expect(first).toMatchObject({
    type: 'sensu',
    name: 'reader',
    description: 'Reads signals',
  });
});
