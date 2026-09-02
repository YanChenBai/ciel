import type { StreamFn } from '@earendil-works/pi-agent-core';
import {
  createAssistantMessageEventStream,
  type AssistantMessage,
  type Model,
} from '@earendil-works/pi-ai';
import {
  type AnyFunction,
  CielOperation,
  defineCiel,
  defineCue,
  defineInterceptor,
  type InstrumentContext,
} from 'corex';
import { describe, expect, it } from 'vite-plus/test';

import { memoryPlugin } from '../src/plugin.ts';
import {
  createMemoryInstructions,
  MEMORY_PLUGIN_INSTRUCTIONS,
  resolveMemoryPrompts,
} from '../src/prompts.ts';
import { createMemory } from '../src/runtime.ts';
import type { MemoryStore } from '../src/types.ts';

const testModel = {
  id: 'test',
  name: 'Test',
  api: 'openai-responses',
  provider: 'openai',
  baseUrl: 'https://example.invalid',
  reasoning: false,
  input: ['text'],
  cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
  contextWindow: 100_000,
  maxTokens: 4_096,
} as Model<any>;

function assistantMessage(
  text: string,
  stopReason: AssistantMessage['stopReason'] = 'stop',
): AssistantMessage {
  return {
    role: 'assistant',
    content: [{ type: 'text', text }],
    api: testModel.api,
    provider: testModel.provider,
    model: testModel.id,
    usage: {
      input: 0,
      output: 0,
      cacheRead: 0,
      cacheWrite: 0,
      totalTokens: 0,
      cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
    },
    stopReason,
    timestamp: Date.now(),
  };
}

function streamText(text: string): ReturnType<StreamFn> {
  return streamMessage(assistantMessage(text));
}

function streamMessage(message: AssistantMessage): ReturnType<StreamFn> {
  const stream = createAssistantMessageEventStream();
  queueMicrotask(() => {
    stream.push({ type: 'start', partial: { ...message, stopReason: 'pending' } });
    stream.push({ type: 'done', reason: 'stop', message });
  });
  return stream;
}

const embedder = {
  doEmbed: () =>
    Promise.resolve({
      embeddings: [[1, 0, 0]],
    }),
};

const testCue = defineCue({ name: 'test', prompt: 'test' });

describe('Memory runtime', () => {
  it('通过 remember Tool 写入，并由只读 Projector 投影', async () => {
    const runtime = createMemory({
      id: 'ciel:runtime',
      scope: () => ({ id: 'room:1', label: '一号直播间' }),
      store: { path: ':memory:' },
      embedder,
      agent: {
        model: testModel,
        stream: () => streamText('主播介绍了一只黑猫。'),
        instructions: createMemoryInstructions(),
        prompts: resolveMemoryPrompts(),
      },
      now: () => new Date(2026, 7, 30, 12).getTime(),
    });
    await runtime.start();

    const remember = runtime.tools.find(tool => tool.name === 'memory_remember');
    expect(remember).toBeDefined();
    const result = await remember!.execute('call:1', {
      content: '画面中主播介绍了一只黑猫。',
      scope: 'current',
      idempotencyKey: 'event:1',
    });
    const projected = await runtime.projector.project({} as never);

    expect(result.details).toMatchObject({ remembered: true });
    expect(projected).toEqual([
      { type: 'text', text: '# 最近经历\n\n## 2026-08-30\n\n- 主播介绍了一只黑猫。' },
    ]);
    await runtime.close();
    await expect(runtime.close()).resolves.toBeUndefined();
  });

  it('没有 embedder 时保存正文并通过文本候选召回', async () => {
    const outputs = ['傲慢的小肉包是一位主播。', '["daily:1"]'];
    const searchQueries: (string | undefined)[] = [];
    const store: MemoryStore = {
      ...createTestStore(),
      search: options => {
        searchQueries.push(options.query);
        return Promise.resolve({
          entries: [
            {
              id: 'daily:1',
              kind: 'daily',
              scope: 'global',
              content: '傲慢的小肉包是一位主播。',
              date: '2026-08-30',
              occurredAt: 100,
              createdAt: 100,
            },
          ],
        });
      },
      recall: () => Promise.reject(new Error('不应执行向量召回')),
    };
    const runtime = createMemory({
      id: 'ciel:text-recall',
      store,
      agent: {
        model: testModel,
        stream: () => streamText(outputs.shift()!),
        instructions: createMemoryInstructions(),
        prompts: resolveMemoryPrompts(),
      },
    });
    await runtime.start();

    const remember = runtime.tools.find(tool => tool.name === 'memory_remember')!;
    const recall = runtime.tools.find(tool => tool.name === 'memory_recall')!;
    await remember.execute('call:remember', {
      content: '傲慢的小肉包正在直播。',
      scope: 'global',
    });
    const recalled = await recall.execute('call:recall', {
      query: '傲慢的小肉包 主播',
      scope: 'all',
    });

    expect(recalled.details).toMatchObject([
      { id: 'daily:1', content: '傲慢的小肉包是一位主播。', score: 1 },
    ]);
    expect(searchQueries).toEqual(['傲慢的小肉包 主播', undefined]);
    expect(outputs).toEqual([]);
    await runtime.close();
  });

  it('memory Plugin 可随 Corex 生命周期启动和关闭', async () => {
    let systemPrompt: string | undefined;
    const memory = memoryPlugin({
      name: 'memory',
      store: { path: ':memory:' },
      embedder,
    });
    const ciel = defineCiel({
      id: 'ciel:plugin',
      instructions: 'test',
      model: testModel,
      stream: (_model, context) => {
        systemPrompt = context.systemPrompt;
        return streamText('ok');
      },
      sessionStore: false,
      extensions: [memory],
    });

    await expect(ciel.start()).resolves.toBeUndefined();
    await ciel.think(testCue.create({ kind: 'instant', at: 1 }));
    expect(systemPrompt).toBe(`test\n\n${MEMORY_PLUGIN_INSTRUCTIONS}`);
    expect(systemPrompt).not.toContain('你是独立的 Memory Agent');
    await expect(ciel.stop()).resolves.toBeUndefined();
  });

  it('主 Agent 调用 memory_remember 时保留 Plugin 插桩上下文', async () => {
    const operations: InstrumentContext[] = [];
    const observer = defineInterceptor({
      name: 'memory-observer',
      interceptor: {
        intercept<T extends AnyFunction>(_target: T, context?: InstrumentContext) {
          if (context?.name !== CielOperation.ToolExecute.name) return undefined;
          return next =>
            ((...args: Parameters<T>) => {
              operations.push(context);
              return next(...args);
            }) as T;
        },
      },
    });
    const generated: AssistantMessage[] = [
      {
        ...assistantMessage('', 'toolUse'),
        content: [
          {
            type: 'toolCall',
            id: 'memory-call',
            name: 'memory_remember',
            arguments: { content: '主播养了一只黑猫', scope: 'global' },
          },
        ],
      },
      assistantMessage('主播养了一只黑猫。'),
      assistantMessage('done'),
    ];
    const memory = memoryPlugin({
      name: 'memory',
      store: createTestStore(),
      embedder,
    });
    const ciel = defineCiel({
      id: 'ciel:instrumented-memory',
      instructions: 'test',
      model: testModel,
      stream: () => streamMessage(generated.shift()!),
      sessionStore: false,
      extensions: [observer, memory],
    });

    await ciel.start();
    await ciel.think(testCue.create({ kind: 'instant', at: 1 }));

    expect(operations).toHaveLength(1);
    expect(operations[0]).toMatchObject({
      ...CielOperation.ToolExecute,
      metadata: {
        pluginId: memory.id,
        pluginName: memory.name,
        toolLabel: 'Remember memory',
        toolName: 'memory_remember',
      },
    });
    await ciel.stop();
  });

  it('新日期首次写入前结算旧日期并生成长期 revision', async () => {
    let currentTime = new Date(2026, 7, 29, 12).getTime();
    const outputs = [
      '主播介绍了一只黑猫。',
      '主播养了一只黑猫。',
      '主播第二天展示了黑猫的新玩具。',
    ];
    const runtime = createMemory({
      id: 'ciel:rollover',
      scope: () => ({ id: 'room:1', label: '一号直播间' }),
      store: { path: ':memory:' },
      embedder,
      agent: {
        model: testModel,
        stream: () => streamText(outputs.shift()!),
        instructions: createMemoryInstructions(),
        prompts: resolveMemoryPrompts(),
      },
      now: () => currentTime,
    });
    await runtime.start();
    const remember = runtime.tools.find(tool => tool.name === 'memory_remember')!;

    await remember.execute('call:day-1', { content: '第一天的黑猫介绍。', scope: 'current' });
    currentTime = new Date(2026, 7, 30, 12).getTime();
    await remember.execute('call:day-2', { content: '第二天展示了新玩具。', scope: 'current' });

    const projected = await runtime.projector.project({} as never);
    expect(projected[0]).toMatchObject({ type: 'text' });
    expect((projected[0] as { text: string }).text).toContain('## 当前场景\n\n主播养了一只黑猫。');
    expect((projected[0] as { text: string }).text).toContain('## 2026-08-30');
    expect(outputs).toEqual([]);
    await runtime.close();
  });
});

function createTestStore(): MemoryStore {
  return {
    start: () => Promise.resolve(),
    close: () => Promise.resolve(),
    appendDaily: options =>
      Promise.resolve({
        id: 'daily:1',
        date: options.date,
        scope: options.scope,
        content: options.content,
        occurredAt: options.occurredAt,
        createdAt: options.createdAt,
        ...(options.idempotencyKey ? { idempotencyKey: options.idempotencyKey } : {}),
      }),
    commitLongTerm: options =>
      Promise.resolve({
        id: 'long-term:1',
        scope: options.scope,
        content: options.content,
        revision: 1,
        basedOnDates: options.basedOnDates,
        createdAt: options.createdAt,
      }),
    latestLongTerm: () => Promise.resolve(undefined),
    listDaily: () => Promise.resolve([]),
    listPendingDates: () => Promise.resolve([]),
    markDateConsolidated: () => Promise.resolve(),
    search: () => Promise.resolve({ entries: [] }),
    recall: () => Promise.resolve([]),
  };
}
