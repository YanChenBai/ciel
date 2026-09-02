import { createInstrumenter } from '@ciels/interceptor';
import { CielOperation } from 'corex';
import { beforeEach, describe, expect, test } from 'vite-plus/test';

import { createSerializer, defineTransformer, telemetry } from '../src/index.ts';

class Token {
  constructor(readonly value: string) {}
}

const TestOperationTag = {
  Test: 'TEST',
} as const;

const TestOperation = {
  Calculate: { name: 'test.calculate', label: 'Calculate', tag: TestOperationTag.Test },
  Token: { name: 'test.token', label: 'Token', tag: TestOperationTag.Test },
} as const;

describe('Corex telemetry', () => {
  beforeEach(() => {
    telemetry.clear();
    telemetry({ capture: true });
  });

  test('记录嵌套 operation 并可查找父级', async () => {
    const instrument = createInstrumenter([telemetry]);
    const generate = instrument(async () => 'generated', CielOperation.ModelGenerate);
    const executeTool = instrument(async () => 'remembered', {
      ...CielOperation.ToolExecute,
      metadata: { toolName: 'memory_remember' },
    });
    const think = instrument(async () => {
      expect(telemetry.currentOperation()?.name).toBe(CielOperation.AgentRun.name);
      await generate();
      await executeTool();
    }, CielOperation.AgentRun);

    await think();

    const starts = telemetry.events().filter(event => event.type === 'operation.started');
    const thought = starts.find(event => event.operation.name === CielOperation.AgentRun.name)!;
    const generation = starts.find(
      event => event.operation.name === CielOperation.ModelGenerate.name,
    )!;
    const tool = starts.find(event => event.operation.name === CielOperation.ToolExecute.name)!;

    expect(generation.operation.parentOperationId).toBe(thought.operation.id);
    expect(tool.operation.parentOperationId).toBe(thought.operation.id);
    expect(telemetry.parentOf(generation.operation.id)).toEqual(thought.operation);
    expect(telemetry.operation(tool.operation.id)).toEqual(tool.operation);
    expect(telemetry.events().at(-1)).toMatchObject({
      type: 'operation.completed',
      operation: thought.operation,
    });
  });

  test('AgentGenerate 等待模型事件流的最终结果再完成', async () => {
    const instrument = createInstrumenter([telemetry]);
    const executeTool = instrument(async () => 'tool result', CielOperation.ToolExecute);
    let finish!: (value: unknown) => void;
    const result = new Promise<unknown>(resolve => {
      finish = resolve;
    });
    const generationCompleted = new Promise<void>(resolve => {
      const unsubscribe = telemetry.subscribe(event => {
        if (
          event.type === 'operation.completed' &&
          event.operation.name === CielOperation.ModelGenerate.name
        ) {
          unsubscribe();
          resolve();
        }
      });
    });
    const generate = instrument(
      () => ({
        result: async () => {
          await executeTool();
          return result;
        },
      }),
      CielOperation.ModelGenerate,
    );

    generate();
    await Promise.resolve();
    const starts = telemetry.events().filter(event => event.type === 'operation.started');
    const generation = starts.find(
      event => event.operation.name === CielOperation.ModelGenerate.name,
    )!;
    const tool = starts.find(event => event.operation.name === CielOperation.ToolExecute.name)!;
    expect(tool.operation.parentOperationId).toBe(generation.operation.id);

    finish({ stopReason: 'stop', content: 'done' });
    await generationCompleted;

    expect(
      telemetry.events().filter(event => event.operation.id === generation.operation.id),
    ).toHaveLength(2);
  });

  test('隔离 subscriber 错误并支持序号游标查询', () => {
    const instrument = createInstrumenter([telemetry]);
    const unsubscribe = telemetry.subscribe(() => {
      throw new Error('subscriber failed');
    });
    const observed = instrument((value: number) => value * 2, TestOperation.Calculate);
    const after = telemetry.throughSequence;

    expect(observed(2)).toBe(4);
    expect(observed(3)).toBe(6);
    expect(telemetry.events({ after, limit: 2 }).map(event => event.sequence)).toEqual([
      after + 1,
      after + 2,
    ]);
    unsubscribe();
  });

  test('使用 SuperJSON 自定义转换器捕获领域对象', () => {
    const tokenTransformer = defineTransformer({
      name: 'token',
      isApplicable: (value): value is Token => value instanceof Token,
      serialize: value => value.value,
      deserialize: value => new Token(value),
    });
    const serializer = createSerializer([tokenTransformer]);
    telemetry({
      transformers: [tokenTransformer],
    });
    const instrument = createInstrumenter([telemetry]);
    const readToken = instrument(() => new Token('ciel'), TestOperation.Token);

    readToken();

    const completed = telemetry.events().find(event => event.type === 'operation.completed');
    expect(completed?.output).toBeDefined();
    expect(serializer.parse(completed!.output!)).toEqual(new Token('ciel'));
  });
});
