import { MockLanguageModelV3 } from 'ai/test';
import { afterEach, describe, expect, it, vi } from 'vite-plus/test';

import { Context } from '#src/context/index.ts';
import { Reading } from '#src/percepts/index.ts';
import { Script } from '#src/signals/index.ts';
import { Stimulus } from '#src/stimulus/index.ts';

import { Nucleus } from './nucleus.ts';
import type { NucleusInput } from './types.ts';

class TestScript extends Script.WithMeta({ name: '对话', description: '当前场景中的消息' }) {}
const signals = [TestScript] as const;

class TestStimulus extends Stimulus<typeof signals> {
  static readonly meta = { name: '直播间', description: '直播场景' };
  readonly signals = signals;
  start(): void {}
  stop(): void {}
}

function createModel(text = '保持安静'): MockLanguageModelV3 {
  return new MockLanguageModelV3({
    doGenerate: {
      content: [{ type: 'text', text }],
      finishReason: { unified: 'stop', raw: undefined },
      usage: {
        inputTokens: { total: 1, noCache: 1, cacheRead: 0, cacheWrite: 0 },
        outputTokens: { total: 1, text: 1, reasoning: 0 },
      },
      warnings: [],
    },
  });
}

function createReading(content: string, timestamp: number): Reading {
  return new Reading({ content, timestamp: new Date(timestamp), originSignal: TestScript });
}

afterEach(() => vi.useRealTimers());

describe('Nucleus', () => {
  it('限制连续思考频率，并在最大间隔后主动思考', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(0);
    const context = new Context(new TestStimulus());
    const model = createModel();
    const inputs: NucleusInput[] = [];
    const nucleus = new Nucleus({
      context,
      model,
      minThinkInterval: 1_000,
      maxThinkInterval: 5_000,
    });
    nucleus.on('thought', (_output, input) => inputs.push(input));

    nucleus.start();
    context.ingest(createReading('第一条', 0));
    await vi.advanceTimersByTimeAsync(0);
    expect(model.doGenerateCalls).toHaveLength(1);
    expect(inputs[0]?.trigger).toBe('percept');

    await vi.advanceTimersByTimeAsync(100);
    context.ingest(createReading('第二条', 100));
    await vi.advanceTimersByTimeAsync(899);
    expect(model.doGenerateCalls).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(model.doGenerateCalls).toHaveLength(2);

    await vi.advanceTimersByTimeAsync(4_999);
    expect(model.doGenerateCalls).toHaveLength(2);
    await vi.advanceTimersByTimeAsync(1);
    expect(model.doGenerateCalls).toHaveLength(3);
    expect(inputs[2]?.trigger).toBe('interval');
    await nucleus.stop();
  });

  it('本轮先召回旧记忆，再由 main Agent 生成情景记忆', async () => {
    const context = new Context(new TestStimulus());
    const model = new MockLanguageModelV3({
      doGenerate: [
        {
          content: [
            {
              type: 'tool-call',
              toolCallId: 'episode-1',
              toolName: 'memory_record_episode',
              input: JSON.stringify({ summary: '用户说了刚刚发生的事情' }),
            },
          ],
          finishReason: { unified: 'tool-calls', raw: undefined },
          usage: {
            inputTokens: { total: 1, noCache: 1, cacheRead: 0, cacheWrite: 0 },
            outputTokens: { total: 1, text: 0, reasoning: 0 },
          },
          warnings: [],
        },
        {
          content: [{ type: 'text', text: '完成' }],
          finishReason: { unified: 'stop', raw: undefined },
          usage: {
            inputTokens: { total: 1, noCache: 1, cacheRead: 0, cacheWrite: 0 },
            outputTokens: { total: 1, text: 1, reasoning: 0 },
          },
          warnings: [],
        },
      ],
    });
    const nucleus = new Nucleus({
      context,
      model,
      memory: { path: ':memory:', longTermLimit: 1, episodicLimit: 1 },
    });
    const memory = nucleus.getMemory();
    await memory.rememberLongTerm({
      name: '旧偏好',
      description: '稳定偏好',
      time: { startAt: new Date(1), endAt: new Date(1) },
      content: { type: 'text', text: '旧内容' },
    });
    await memory.rememberLongTerm({
      name: '新偏好',
      description: '稳定偏好',
      time: { startAt: new Date(2), endAt: new Date(2) },
      content: { type: 'text', text: '新内容' },
    });
    context.ingest(createReading('刚刚发生的事情', 3));

    const output = await nucleus.think();

    expect(output).toBe('完成');
    const prompt = JSON.stringify(model.doGenerateCalls[0]?.prompt);
    expect(prompt).toContain('# 长期记忆');
    expect(prompt).toContain('新内容');
    expect(prompt).not.toContain('旧内容');
    expect(prompt).not.toContain('# 情景记忆');
    const episode = await memory.getContext({ longTermLimit: 0, episodicLimit: 1 });
    expect(episode.entries).toEqual([
      expect.objectContaining({
        kind: 'episodic',
        content: { type: 'text', text: '用户说了刚刚发生的事情' },
      }),
    ]);
    await memory.close();
  });
});
