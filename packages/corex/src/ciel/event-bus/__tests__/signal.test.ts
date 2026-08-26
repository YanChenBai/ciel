import { expect, test } from 'vite-plus/test';

import { defineSignal } from '../../../signal/index.ts';
import { createSignalBus } from '../signal.ts';

const instant = { kind: 'instant', at: 1 } as const;

test('按 Signal 定义路由并等待异步处理器', async () => {
  const selected = defineSignal<string>({ name: 'selected', description: 'Selected' });
  const ignored = defineSignal<string>({ name: 'ignored', description: 'Ignored' });
  const received: string[] = [];
  const signalBus = createSignalBus();

  signalBus.onSignal(selected, async signal => {
    await Promise.resolve();
    received.push(signal.payload);
  });

  await signalBus.emitSignal(ignored.create('ignored', instant));
  await signalBus.emitSignal(selected.create('accepted', instant));

  expect(received).toEqual(['accepted']);
});

test('处理器被释放后停止路由 Signal', async () => {
  const definition = defineSignal({ name: 'event', description: 'Event' });
  let handled = 0;
  const signalBus = createSignalBus();
  const dispose = signalBus.onSignal(definition, () => {
    handled += 1;
  });

  await signalBus.emitSignal(definition.create(undefined, instant));
  await dispose();
  await signalBus.emitSignal(definition.create(undefined, instant));

  expect(handled).toBe(1);
});
