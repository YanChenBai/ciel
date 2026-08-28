import { expect, test } from 'vite-plus/test';

import { DataType, DefinitionType } from '#model';

import { defineCue } from '../index.ts';

const instant = { kind: 'instant', at: 42 } as const;

test('创建保留定义、载荷和时间信息的 Cue', () => {
  const definition = defineCue<{ readonly word: string }>({
    name: 'wake-word-mentioned',
    description: 'A wake word was mentioned',
  });
  const payload = { word: 'Ciel' };

  const cue = definition.create(payload, instant);

  expect(definition).toMatchObject({
    type: DefinitionType.Cue,
    name: 'wake-word-mentioned',
    description: 'A wake word was mentioned',
  });
  expect(cue).toMatchObject({
    type: DataType.Cue,
    definition,
    payload,
    temporal: instant,
  });
});

test('同名 Cue 定义仍具有不同标识', () => {
  const first = defineCue({ name: 'manual', description: 'First' });
  const second = defineCue({ name: 'manual', description: 'Second' });

  expect(first.id).not.toBe(second.id);
});
