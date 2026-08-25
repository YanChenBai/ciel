import { expect, test } from 'vite-plus/test';

import { definePercept, defineSensu, defineSignal, defineStimulus } from '../src/index.ts';

const instant = { kind: 'instant', at: 42 } as const;

test('创建保留定义、载荷和时间信息的 Signal', () => {
  const definition = defineSignal<{ readonly text: string }>({
    name: 'message',
    description: 'A text message',
  });
  const payload = { text: 'hello' };

  const signal = definition.create(payload, instant);

  expect(definition).toMatchObject({
    name: 'message',
    description: 'A text message',
  });
  expect(signal).toMatchObject({
    definition,
    payload,
    temporal: instant,
  });
});

test('同名 Signal 定义仍具有不同标识', () => {
  const first = defineSignal({ name: 'message', description: 'First' });
  const second = defineSignal({ name: 'message', description: 'Second' });

  expect(first.symbol).not.toBe(second.symbol);
});

test('创建包含来源和可选置信度的多模态 Percept', () => {
  const signalDefinition = defineSignal<string>({
    name: 'input',
    description: 'Input',
  });
  const source = signalDefinition.create('payload', instant);
  const definition = definePercept({
    name: 'observation',
    description: 'An observation',
  });
  const contents = [
    { type: 'text', text: 'hello' },
    { type: 'image', data: 'image-data', mimeType: 'image/png' },
    { type: 'audio', data: new Uint8Array([1, 2]), mimeType: 'audio/wav' },
  ] as const;

  const percept = definition.create({
    source,
    contents: [...contents],
    temporal: instant,
    confidence: 0.75,
  });

  expect(percept).toMatchObject({
    definition,
    source,
    contents,
    temporal: instant,
    confidence: 0.75,
  });
});

test('保留 Stimulus 的 Signal 集合和 setup 行为', async () => {
  const signal = defineSignal({ name: 'tick', description: 'Tick' });
  let setupContext: unknown;
  const stimulus = defineStimulus({
    name: 'clock',
    description: 'Clock stimulus',
    signals: { tick: signal },
    setup(ctx) {
      setupContext = ctx;
    },
  });
  const context = {
    signals: stimulus.signals,
    emitSignal: async () => {},
    onDispose: () => {},
  };

  await stimulus.setup(context);

  expect(stimulus.signals).toEqual({ tick: signal });
  expect(setupContext).toBe(context);
});

test('创建绑定到各自声明 Signal 的独立 Sensu 实例', () => {
  const firstSignal = defineSignal<string>({ name: 'first', description: 'First' });
  const secondSignal = defineSignal<string>({ name: 'second', description: 'Second' });
  const sensuDefinition = defineSensu<string>(() => ({
    name: 'reader',
    description: 'Reads signals',
    setup() {},
  }));

  const first = sensuDefinition(firstSignal);
  const second = sensuDefinition(firstSignal, secondSignal);

  expect(first.signals).toEqual([firstSignal]);
  expect(second.signals).toEqual([firstSignal, secondSignal]);
  expect(first.symbol).not.toBe(second.symbol);
  expect(first).toMatchObject({ name: 'reader', description: 'Reads signals' });
});
