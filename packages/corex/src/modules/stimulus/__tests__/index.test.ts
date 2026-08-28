import { expect, test } from 'vite-plus/test';

import { defineStimulus } from '../index.ts';

test('保留 Stimulus 的 setup 行为', async () => {
  let setupContext: unknown;
  const stimulus = defineStimulus({
    name: 'clock',
    description: 'Clock stimulus',
    setup(ctx) {
      setupContext = ctx;
    },
  });
  const context = {
    emitSignal: async () => {},
    onDispose: () => {},
  };

  await stimulus.setup(context);

  expect(setupContext).toBe(context);
  expect(stimulus).toMatchObject({ type: 'stimulus' });
});
