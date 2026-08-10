// @env node

import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { MockLanguageModelV3 } from 'ai/test';
import { afterEach, describe, expect, it } from 'vite-plus/test';

import { Context } from '#src/context/index.ts';
import { Memory } from '#src/memory/index.ts';
import { Reading, Sight } from '#src/percepts/index.ts';
import { Photon, Script } from '#src/signals/index.ts';
import { Stimulus } from '#src/stimulus/index.ts';

import { runNucleusAgent } from './agent.ts';
import type { NucleusInput } from './types.ts';

class TestPhoton extends Photon.WithMeta({ name: '画面', description: '最新视觉观察' }) {}
class TestScript extends Script.WithMeta({ name: '对话', description: '场景中的消息' }) {}
const signals = [TestPhoton, TestScript] as const;

class TestStimulus extends Stimulus<typeof signals> {
  static readonly meta = { name: '直播间', description: '直播场景' };
  readonly signals = signals;
  start(): void {}
  stop(): void {}
}

function createModel(text = '回应'): MockLanguageModelV3 {
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

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryDirectories.splice(0).map(directory => rm(directory, { recursive: true })),
  );
});

describe('Nucleus 内置 Agent', () => {
  it('把定义放入 system，并把实时感知作为多模态本轮输入', async () => {
    const directory = await mkdtemp(path.join(tmpdir(), 'ciel-context-'));
    temporaryDirectories.push(directory);
    const imagePath = path.join(directory, 'scene.png');
    await writeFile(imagePath, Buffer.from([1, 2, 3]));

    const context = new Context(new TestStimulus());
    context.define({ name: '目标', description: '判断是否需要互动' });
    context.ingest(
      new Reading({ content: '你好', timestamp: new Date(1), originSignal: TestScript }),
    );
    context.ingest(
      new Sight({
        path: imagePath,
        startAt: new Date(2),
        endAt: new Date(2),
        originSignal: TestPhoton,
      }),
    );
    const input: NucleusInput = {
      trigger: 'percept',
      context: context.snapshot(new Date(3)),
      memories: [],
      memoryInstructions: '长期记忆生成的系统上下文',
    };
    const model = createModel();

    const output = await runNucleusAgent(input, {
      context,
      model,
      prompt: { identity: '你是夏尔。' },
      messages: [() => ({ role: 'user', content: '当前任务' })],
    });

    expect(output).toBe('回应');
    const call = model.doGenerateCalls[0];
    const serialized = JSON.stringify(call);
    expect(serialized).toContain('你是夏尔。');
    expect(serialized).toContain('长期记忆生成的系统上下文');
    expect(serialized).toContain('## 直播间');
    expect(serialized).toContain('## 画面');
    expect(serialized).toContain('## 目标');
    expect(serialized).toContain('[对话]');
    expect(serialized).toContain('当前任务');
    expect(call?.prompt.some(message => message.role === 'user')).toBe(true);
  });

  it('启用 Memory 时自动提供记忆工具，并保护内置工具名称', async () => {
    const context = new Context(new TestStimulus());
    const model = createModel();
    const memory = new Memory({ path: ':memory:', model });
    const input: NucleusInput = {
      trigger: 'manual',
      context: context.snapshot(),
      memories: [],
    };

    await runNucleusAgent(input, { context, model }, memory);
    expect(JSON.stringify(model.doGenerateCalls[0]?.tools)).toContain('memory_remember');
    expect(JSON.stringify(model.doGenerateCalls[0]?.tools)).toContain('memory_recall');
    expect(JSON.stringify(model.doGenerateCalls[0]?.tools)).toContain('memory_record_episode');

    await expect(
      runNucleusAgent(
        input,
        { context, model, tools: { memory_remember: { inputSchema: {} as never } } },
        memory,
      ),
    ).rejects.toThrow('reserved by Nucleus');
    await memory.close();
  });
});
