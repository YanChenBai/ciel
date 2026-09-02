import { expect, test } from 'vite-plus/test';

import { defineSignal } from '#model/signal/index.ts';

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

  await signalBus.dispatchSignal(ignored.create('ignored', instant));
  await signalBus.dispatchSignal(selected.create('accepted', instant));

  expect(received).toEqual(['accepted']);
});

test('处理器被释放后停止路由 Signal', async () => {
  const definition = defineSignal({ name: 'event', description: 'Event' });
  let handled = 0;
  const signalBus = createSignalBus();
  const dispose = signalBus.onSignal(definition, () => {
    handled += 1;
  });

  await signalBus.dispatchSignal(definition.create(undefined, instant));
  await dispose();
  await signalBus.dispatchSignal(definition.create(undefined, instant));

  expect(handled).toBe(1);
});

test('等待处理器并传播聚合错误', async () => {
  const definition = defineSignal({ name: 'failed', description: 'Failed' });
  const signalBus = createSignalBus();
  const error = new Error('signal failed');

  signalBus.onSignal(definition, () => {
    throw error;
  });

  const emittedError = await signalBus
    .dispatchSignal(definition.create(undefined, instant))
    .catch((caught: unknown) => caught);
  expect(emittedError).toBeInstanceOf(AggregateError);
  expect((emittedError as AggregateError).errors).toEqual([error]);
});

test('同一个处理器重复订阅同一事件时只执行一次', async () => {
  const definition = defineSignal({ name: 'deduplicated', description: 'Deduplicated' });
  const signalBus = createSignalBus();
  let handled = 0;
  const handler = () => {
    handled += 1;
  };

  signalBus.onSignal(definition, handler);
  signalBus.onSignal(definition, handler);

  await signalBus.dispatchSignal(definition.create(undefined, instant));

  expect(handled).toBe(1);
});
