import { expect, test } from 'vite-plus/test';

import { DataType, DefinitionType } from '../../types/index.ts';
import { defineSignal } from '../index.ts';

const instant = { kind: 'instant', at: 42 } as const;

test('创建保留定义、载荷和时间信息的 Signal', () => {
  const definition = defineSignal<{ readonly text: string }>({
    name: 'message',
    description: 'A text message',
  });
  const payload = { text: 'hello' };

  const signal = definition.create(payload, instant);

  expect(definition).toMatchObject({
    type: DefinitionType.Signal,
    name: 'message',
    description: 'A text message',
  });
  expect(signal).toMatchObject({
    type: DataType.Signal,
    definition,
    payload,
    temporal: instant,
  });
});

test('同名 Signal 定义仍具有不同标识', () => {
  const first = defineSignal({ name: 'message', description: 'First' });
  const second = defineSignal({ name: 'message', description: 'Second' });

  expect(first.id).not.toBe(second.id);
});
