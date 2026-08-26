import { describe, expect, it } from 'vite-plus/test';

import { definePercept } from '../../../percept/index.ts';
import { defineSignal } from '../../../signal/index.ts';
import { createPerceptBus } from '../percept.ts';

const instant = { kind: 'instant', at: 1 } as const;

function createFixture() {
  const signal = defineSignal({ name: 'input', description: 'Input' });
  const definition = definePercept({ name: 'result', description: 'Result' });
  const percept = definition.create({
    source: signal.create(undefined, instant),
    contents: [],
    temporal: instant,
  });

  return { definition, percept };
}

describe('PerceptBus 错误隔离', () => {
  it('全量监听器失败后继续执行特定监听器', async () => {
    const { definition, percept } = createFixture();
    const perceptBus = createPerceptBus();
    const calls: string[] = [];
    const error = new Error('any failed');

    perceptBus.onAnyPercept(() => {
      calls.push('any');
      throw error;
    });
    perceptBus.onPercept(definition, () => {
      calls.push('specific');
    });

    await expect(perceptBus.emitPercept(percept)).rejects.toBe(error);
    expect(calls).toEqual(['any', 'specific']);
  });

  it('特定监听器失败时保留原始错误', async () => {
    const { definition, percept } = createFixture();
    const perceptBus = createPerceptBus();
    const error = new Error('specific failed');

    perceptBus.onAnyPercept(() => undefined);
    perceptBus.onPercept(definition, () => {
      throw error;
    });

    await expect(perceptBus.emitPercept(percept)).rejects.toBe(error);
  });

  it('两个通道都失败时按执行顺序聚合错误', async () => {
    const { definition, percept } = createFixture();
    const perceptBus = createPerceptBus();
    const anyError = new Error('any failed');
    const specificError = new Error('specific failed');

    perceptBus.onAnyPercept(() => {
      throw anyError;
    });
    perceptBus.onPercept(definition, () => {
      throw specificError;
    });

    let error: unknown;
    try {
      await perceptBus.emitPercept(percept);
    } catch (caught) {
      error = caught;
    }

    expect(error).toBeInstanceOf(AggregateError);
    expect((error as AggregateError).errors).toEqual([anyError, specificError]);
  });

  it('同一个处理器显式订阅两个通道时分别执行', async () => {
    const { definition, percept } = createFixture();
    const perceptBus = createPerceptBus();
    let calls = 0;
    const handler = () => {
      calls++;
    };

    perceptBus.onAnyPercept(handler);
    perceptBus.onPercept(definition, handler);

    await perceptBus.emitPercept(percept);

    expect(calls).toBe(2);
  });
});
