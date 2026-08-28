import { expect, test } from 'vite-plus/test';

import { definePercept } from '#model/percept/index.ts';
import { defineSignal } from '#model/signal/index.ts';

import { createPerceptBus } from '../percept.ts';

const instant = { kind: 'instant', at: 1 } as const;

test('按 Percept 定义路由并等待异步处理器', async () => {
  const signalDefinition = defineSignal<string>({ name: 'input', description: 'Input' });
  const selected = definePercept({ name: 'selected', description: 'Selected' });
  const ignored = definePercept({ name: 'ignored', description: 'Ignored' });
  const source = signalDefinition.create('hello', instant);
  const allPercepts: unknown[] = [];
  const selectedPercepts: unknown[] = [];
  const perceptBus = createPerceptBus();

  perceptBus.onAnyPercept(percept => {
    allPercepts.push(percept);
  });
  perceptBus.onPercept(selected, async percept => {
    await Promise.resolve();
    selectedPercepts.push(percept);
  });

  await perceptBus.emitPercept(
    ignored.create({
      source,
      contents: [{ type: 'text', text: 'ignored' }],
      temporal: instant,
    }),
  );
  const selectedPercept = selected.create({
    source,
    contents: [{ type: 'text', text: 'accepted' }],
    temporal: instant,
  });
  await perceptBus.emitPercept(selectedPercept);

  expect(allPercepts).toHaveLength(2);
  expect(selectedPercepts).toEqual([selectedPercept]);
});

test('处理器被释放后停止接收 Percept', async () => {
  const signalDefinition = defineSignal({ name: 'input', description: 'Input' });
  const definition = definePercept({ name: 'result', description: 'Result' });
  const source = signalDefinition.create(undefined, instant);
  const perceptBus = createPerceptBus();
  let handled = 0;
  const dispose = perceptBus.onPercept(definition, () => {
    handled += 1;
  });
  const create = () =>
    definition.create({
      source,
      contents: [],
      temporal: instant,
    });

  await perceptBus.emitPercept(create());
  await dispose();
  await perceptBus.emitPercept(create());

  expect(handled).toBe(1);
});
