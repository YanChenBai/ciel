import { expect, expectTypeOf, test } from 'vite-plus/test';

import {
  DataType,
  DefinitionType,
  defineCue,
  definePercept,
  defineSignal,
  referenceSignal,
} from '#model';

const instant = { kind: 'instant', at: 42 } as const;

test('创建保留定义、载荷和时间信息的 Signal 与 Cue', () => {
  const signalDefinition = defineSignal<{ readonly text: string }>({
    name: 'message',
    description: 'A text message',
  });
  const cueDefinition = defineCue<{ readonly word: string }>({
    name: 'wake-word-mentioned',
    description: 'A wake word was mentioned',
    prompt: 'Respond to the latest perception.',
  });
  const signalPayload = { text: 'hello' };
  const cuePayload = { word: 'Ciel' };

  expect(signalDefinition.create(signalPayload, instant)).toMatchObject({
    id: expect.any(String),
    type: DataType.Signal,
    definition: signalDefinition,
    payload: signalPayload,
    temporal: instant,
  });
  expect(cueDefinition.create(instant, cuePayload)).toMatchObject({
    id: expect.any(String),
    type: DataType.Cue,
    definition: cueDefinition,
    payload: cuePayload,
    temporal: instant,
  });
  expect(signalDefinition).toMatchObject({
    type: DefinitionType.Signal,
    name: 'message',
    description: 'A text message',
  });
  expect(cueDefinition).toMatchObject({
    type: DefinitionType.Cue,
    name: 'wake-word-mentioned',
    description: 'A wake word was mentioned',
    prompt: 'Respond to the latest perception.',
  });
});

test('无载荷 Cue 保持可省略 payload 的调用契约', () => {
  const definition = defineCue({ name: 'manual' });

  expectTypeOf(definition.create).toBeCallableWith(instant);
  expect(definition.create(instant)).toMatchObject({
    id: expect.any(String),
    type: DataType.Cue,
    definition,
    payload: undefined,
    temporal: instant,
  });
});

test('创建包含来源和可选置信度的多模态 Percept', () => {
  const signalDefinition = defineSignal<string>({ name: 'input' });
  const source = signalDefinition.create('payload', instant);
  const definition = definePercept({ name: 'observation' });
  const contents = [
    { type: 'text', text: 'hello' },
    { type: 'image', data: 'image-data' },
    { type: 'audio', data: new Uint8Array([1, 2]), mimeType: 'audio/wav' },
  ] as const;

  expect(
    definition.create({
      origin: signalDefinition,
      causes: [referenceSignal(source)],
      contents: [...contents],
      temporal: instant,
      confidence: 0.75,
    }),
  ).toMatchObject({
    id: expect.any(String),
    type: DataType.Percept,
    definition,
    origin: signalDefinition,
    causes: [referenceSignal(source)],
    contents,
    temporal: instant,
    confidence: 0.75,
  });
  expect(definition).toMatchObject({ type: DefinitionType.Percept });
});

test('每个定义和数据实例获得独立标识', () => {
  const definitions = [
    defineSignal({ name: 'same-name' }),
    defineSignal({ name: 'same-name' }),
    defineCue({ name: 'same-name' }),
    definePercept({ name: 'same-name' }),
  ];
  const ids = definitions.map(definition => definition.id);

  expect(ids).toEqual(ids.map(() => expect.any(String)));
  expect(new Set(ids).size).toBe(ids.length);

  const signal = defineSignal({ name: 'instance' });
  const instances = [signal.create(undefined, instant), signal.create(undefined, instant)];
  expect(new Set(instances.map(instance => instance.id)).size).toBe(instances.length);
});
