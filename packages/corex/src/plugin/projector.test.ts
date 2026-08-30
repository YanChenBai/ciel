import { describe, expect, it } from 'vite-plus/test';

import { defineProjector } from './projector.ts';

describe('defineProjector', () => {
  it('创建直接贡献自身的 Projector Plugin', () => {
    const speech = defineProjector({
      name: 'speech',
      project: () => [{ type: 'text', text: 'hello' }],
    });
    const vision = defineProjector({
      name: 'vision',
      project: () => [{ type: 'image', data: 'frame' }],
    });
    expect(speech).toMatchObject({
      id: expect.any(String),
      name: 'speech',
      project: expect.any(Function),
      projectors: [expect.objectContaining({ name: 'speech' })],
    });
    const ids = [speech.id, vision.id];
    expect(ids).toEqual(ids.map(() => expect.any(String)));
    expect(new Set(ids).size).toBe(ids.length);
  });
});
