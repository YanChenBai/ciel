import { describe, expect, it } from 'vite-plus/test';

import { defineProjector } from '../projector/index.ts';
import { ModuleType } from '../types/index.ts';
import { defineProjection } from './index.ts';

describe('defineProjection', () => {
  it('保留具名 Projector 对象并创建顶层模块', () => {
    const speech = defineProjector({
      name: 'speech',
      project: () => ['hello'],
    });
    const vision = defineProjector({
      name: 'vision',
      project: () => 1,
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
