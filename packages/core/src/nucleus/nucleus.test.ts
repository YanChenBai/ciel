import { MockLanguageModelV3 } from 'ai/test';
import { afterEach, describe, expect, it, vi } from 'vite-plus/test';

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

function response(text: string) {
  return {
    content: [{ type: 'text' as const, text }],
    finishReason: { unified: 'stop' as const, raw: undefined },
    usage: {
      inputTokens: { total: 1, noCache: 1, cacheRead: 0, cacheWrite: 0 },
      outputTokens: { total: 1, text: 1, reasoning: 0 },
    },
    warnings: [],
  };
}

function createModel(text = '保持安静'): MockLanguageModelV3 {
  return new MockLanguageModelV3({ doGenerate: response(text) });
}

function createReading(content: string, timestamp: number): Reading {
  return new Reading({ content, timestamp: new Date(timestamp), originSignal: TestScript });
}

afterEach(() => vi.useRealTimers());

describe('Nucleus', () => {
  it('限制连续思考频率，并在最大间隔后主动思考', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(0);
    const stimulus = new TestStimulus();
    const model = createModel();
    const inputs: NucleusInput[] = [];
    const nucleus = new Nucleus({
      model,
      memory: { path: ':memory:' },
      minThinkInterval: 1_000,
      maxThinkInterval: 5_000,
    });
    nucleus.register(stimulus);
    nucleus.on('thought', (_output, input) => inputs.push(input));

    nucleus.start();
    nucleus.ingest(stimulus, createReading('第一条', 0));
    await vi.advanceTimersByTimeAsync(0);
    expect(model.doGenerateCalls).toHaveLength(1);
    expect(inputs[0]?.trigger).toBe('percept');

    await vi.advanceTimersByTimeAsync(100);
    nucleus.ingest(stimulus, createReading('第二条', 100));
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

  it('本轮先召回旧记忆，并在 Episode 结束后由 runtime 生成情景记忆', async () => {
    const stimulus = new TestStimulus();
    const model = new MockLanguageModelV3({
      doGenerate: [
        {
          content: [{ type: 'text', text: '完成' }],
          finishReason: { unified: 'stop', raw: undefined },
          usage: {
            inputTokens: { total: 1, noCache: 1, cacheRead: 0, cacheWrite: 0 },
            outputTokens: { total: 1, text: 1, reasoning: 0 },
          },
          warnings: [],
        },
        {
          content: [{ type: 'text', text: '用户说了刚刚发生的事情' }],
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
      model,
      memory: { path: ':memory:', longTermLimit: 1, episodicLimit: 1 },
    });
    nucleus.register(stimulus);
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
    nucleus.ingest(stimulus, createReading('刚刚发生的事情', 3));

    const output = await nucleus.think();

    expect(output).toBe('完成');
    const prompt = JSON.stringify(model.doGenerateCalls[0]?.prompt);
    expect(prompt).toContain('# 长期记忆');
    expect(prompt).toContain('新内容');
    expect(prompt).not.toContain('旧内容');
    expect(prompt).not.toContain('# 情景记忆');
    expect(
      model.doGenerateCalls[0]?.tools?.some(tool => tool.name === 'memory_record_episode'),
    ).toBe(false);
    await nucleus.flushEpisode();
    const episode = await memory.getContext({ longTermLimit: 0, episodicLimit: 1 });
    expect(episode.entries).toEqual([
      expect.objectContaining({
        kind: 'episodic',
        content: { type: 'text', text: '用户说了刚刚发生的事情' },
      }),
    ]);
    await memory.close();
  });

  it('实际输入 token 达到阈值后自动结算 Episode', async () => {
    const stimulus = new TestStimulus();
    const model = new MockLanguageModelV3({
      doGenerate: [response('已处理'), response('用户发送了一条消息。')],
    });
    const nucleus = new Nucleus({
      model,
      memory: { path: ':memory:', episode: { maxInputTokens: 1 } },
    });
    nucleus.register(stimulus);
    nucleus.ingest(stimulus, createReading('一条实时消息', Date.now()));

    await nucleus.think();
    await vi.waitFor(() => expect(model.doGenerateCalls).toHaveLength(2));

    expect((await nucleus.getContext()).data).toEqual([]);
    const episode = await nucleus.getMemory().getContext({ longTermLimit: 0, episodicLimit: 1 });
    expect(episode.entries[0]?.content).toEqual({
      type: 'text',
      text: '用户发送了一条消息。',
    });
    await nucleus.getMemory().close();
  });
});
