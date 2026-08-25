import { expect, test } from 'vite-plus/test';

import { createSignalBus } from '../src/ciel/signal-bus.ts';
import { definePercept, defineSignal } from '../src/index.ts';

const instant = { kind: 'instant', at: 1 } as const;

test('按定义路由 Signal 并接收异步处理结果', async () => {
  const selected = defineSignal<string>({ name: 'selected', description: 'Selected' });
  const ignored = defineSignal<string>({ name: 'ignored', description: 'Ignored' });
  const perceptDefinition = definePercept({ name: 'result', description: 'Result' });
  const outputs: unknown[] = [];
  const bus = createSignalBus(output => outputs.push(output));

  bus.on(selected, async signal =>
    perceptDefinition.create({
      source: signal,
      contents: [{ type: 'text', text: signal.payload }],
      temporal: signal.temporal,
    }),
  );

  await bus.emit(ignored.create('ignored', instant));
  expect(outputs).toEqual([]);

  await bus.emit(selected.create('accepted', instant));
  expect(outputs).toHaveLength(1);
  expect(outputs[0]).toMatchObject({
    contents: [{ type: 'text', text: 'accepted' }],
  });
});

test('处理器被释放后停止路由', async () => {
  const signal = defineSignal({ name: 'event', description: 'Event' });
  const outputs: unknown[] = [];
  const bus = createSignalBus(output => outputs.push(output));
  const dispose = bus.on(signal, () => undefined);

  await bus.emit(signal.create(undefined, instant));
  await dispose();
  await bus.emit(signal.create(undefined, instant));

  expect(outputs).toEqual([undefined]);
});
