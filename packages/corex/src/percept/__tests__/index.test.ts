import { expect, test } from 'vite-plus/test';

import { defineSignal } from '../../signal/index.ts';
import { DataType, DefinitionType } from '../../types/index.ts';
import { definePercept } from '../index.ts';

const instant = { kind: 'instant', at: 42 } as const;

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
    type: DataType.Percept,
    definition,
    source,
    contents,
    temporal: instant,
    confidence: 0.75,
  });
  expect(definition).toMatchObject({ type: DefinitionType.Percept });
});
