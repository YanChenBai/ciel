import type { StreamFn } from '@earendil-works/pi-agent-core';
import {
  createAssistantMessageEventStream,
  type AssistantMessage,
  type Model,
} from '@earendil-works/pi-ai';
import { MockEmbeddingModelV4 } from 'ai/test';
import { defineCiel } from 'corex';
import { describe, expect, it } from 'vite-plus/test';

import { memoryPlugin } from '../src/plugin.ts';
import { createMemoryInstructions, resolveMemoryPrompts } from '../src/prompts.ts';
import { createMemory } from '../src/runtime.ts';

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

function assistantMessage(text: string): AssistantMessage {
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
    stopReason: 'stop',
    timestamp: Date.now(),
  };
}

function streamText(text: string): ReturnType<StreamFn> {
  const stream = createAssistantMessageEventStream();
  queueMicrotask(() => {
    const message = assistantMessage(text);
    stream.push({ type: 'start', partial: { ...message, stopReason: 'pending' } });
    stream.push({ type: 'done', reason: 'stop', message });
  });
  return stream;
}

const embedder = new MockEmbeddingModelV4({
  doEmbed: {
    embeddings: [[1, 0, 0]],
    usage: { tokens: 1 },
    warnings: [],
  },
});

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

  it('memory Plugin 可随 Corex 生命周期启动和关闭', async () => {
    const memory = memoryPlugin({
      name: 'memory',
      store: { path: ':memory:' },
      embedder,
    });
    const ciel = defineCiel({
      id: 'ciel:plugin',
      instructions: 'test',
      model: testModel,
      stream: () => streamText('ok'),
      sessionStore: false,
      plugins: [memory],
    });

    await expect(ciel.start()).resolves.toBeUndefined();
    await expect(ciel.stop()).resolves.toBeUndefined();
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
