import { describe, expect, it } from 'vite-plus/test';

import { ModuleType } from '#modules/types.ts';

import { defineProjection, defineProjector } from './index.ts';

describe('defineProjection', () => {
  it('保留具名 Projector 对象并创建顶层模块', () => {
    const speech = defineProjector({
      name: 'speech',
      project: () => [{ type: 'text', text: 'hello' }],
    });
    const vision = defineProjector({
      name: 'vision',
      project: () => [{ type: 'image', data: 'frame' }],
    });
    const projection = defineProjection({
      name: 'agent-context',
      projectors: { speech, vision },
    });

    expect(projection).toMatchObject({
      type: ModuleType.Projection,
      name: 'agent-context',
      projectors: { speech, vision },
    });
  });
});
