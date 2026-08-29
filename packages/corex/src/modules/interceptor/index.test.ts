import { describe, expect, it } from 'vite-plus/test';

import { defineInterceptor } from './index.ts';

describe('interceptor', () => {
  it('定义为 Ciel 模块', () => {
    const interceptor = defineInterceptor({
      name: 'logger',
      description: 'Logs calls',
      intercept() {
        return undefined;
      },
    });

    expect(interceptor).toMatchObject({
      type: 'interceptor',
      name: 'logger',
      description: 'Logs calls',
      id: expect.any(String),
    });
  });
});
