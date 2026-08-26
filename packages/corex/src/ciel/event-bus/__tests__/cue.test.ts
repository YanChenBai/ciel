import { expect, test } from 'vite-plus/test';

import { defineCue } from '../../../cue/index.ts';
import { createCueBus } from '../cue.ts';

const instant = { kind: 'instant', at: 1 } as const;

test('按 Cue 定义路由并等待异步监听器', async () => {
  const selected = defineCue<string>({ name: 'selected', description: 'Selected' });
  const ignored = defineCue<string>({ name: 'ignored', description: 'Ignored' });
  const received: string[] = [];
  const cueBus = createCueBus();

  cueBus.onCue(selected, async cue => {
    await Promise.resolve();
    received.push(cue.payload);
  });

  await cueBus.emitCue(ignored.create('ignored', instant));
  await cueBus.emitCue(selected.create('accepted', instant));

  expect(received).toEqual(['accepted']);
});

test('处理器被释放后停止路由', async () => {
  const definition = defineCue({ name: 'manual', description: 'Manual' });
  let handled = 0;
  const cueBus = createCueBus();
  const dispose = cueBus.onCue(definition, () => {
    handled += 1;
  });

  await cueBus.emitCue(definition.create(undefined, instant));
  await dispose();
  await cueBus.emitCue(definition.create(undefined, instant));

  expect(handled).toBe(1);
});
