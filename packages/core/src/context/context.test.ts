// @env node

import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterEach, describe, expect, it } from 'vite-plus/test';

import { Hearing, Reading, Sight } from '#percepts';
import { InMemoryPerceptStore } from '#percepts';
import { Echo, Photon, Script } from '#signals';
import { Stimulus } from '#stimulus';

import { Context } from './context.ts';
import { VisionProjector } from './vision.ts';

class TestEcho extends Echo.WithMeta({ name: '语音', description: '识别后的语音' }) {}
class TestPhoton extends Photon.WithMeta({ name: '画面', description: '当前视觉画面' }) {}
class TestScript extends Script.WithMeta({ name: '对话', description: '场景中的文字消息' }) {}
const signals = [TestEcho, TestPhoton, TestScript] as const;

class TestStimulus extends Stimulus<typeof signals> {
  static readonly meta = { name: '直播间', description: '持续发生视听互动的场景' };
  readonly signals = signals;
  start(): void {}
  stop(): void {}
}

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map(directory => rm(directory, { recursive: true, force: true })),
  );
});

describe('Context', () => {
  it('集中构建内部与应用自定义的 system 和 messages', async () => {
    const stimulus = new TestStimulus();
    const context = new Context([...signals], [stimulus], new VisionProjector(4));
    const store = new InMemoryPerceptStore();
    store.register(stimulus);
    store.append(
      stimulus,
      new Hearing({
        content: '欢迎',
        speaker: '主播',
        startAt: new Date(200),
        endAt: new Date(250),
        originSignal: TestEcho,
      }),
    );
    store.append(
      stimulus,
      new Reading({ content: '你好', timestamp: new Date(100), originSignal: TestScript }),
    );
    store.append(
      stimulus,
      new Reading({ content: '补充信息', timestamp: new Date(150), originSignal: TestScript }),
    );
    const input = {
      createdAt: new Date(300),
      data: store.snapshot().records.map(record => ({
        ...record,
        signal: {
          kind: 'signal' as const,
          name: '不应读取的缓存名称',
          description: '不应读取的缓存描述',
        },
      })),
      definitions: context.definitions,
      trigger: 'manual' as const,
    };

    const result = await context.build({
      input,
      internalSystem: ['保持理性与好奇。', '名字：夏尔'],
      longTermMemory: '用户喜欢简洁回答。',
      recentMemory: '用户此前正在检查直播。',
      system: ['应用自定义设定'],
      messages: [() => ({ role: 'user', content: '当前任务' })],
    });

    expect(result.system.startsWith('保持理性与好奇。\n\n名字：夏尔')).toBe(true);
    expect(result.system).toContain('# Stimulus 与 Percept 解释');
    expect(result.system).toContain('## Stimulus');
    expect(result.system).toContain('Stimulus 是持续提供原始 Signal 的外部信息来源');
    expect(result.system).toContain('## Percept');
    expect(result.system).toContain('### Reading');
    expect(result.system).toContain('### Hearing');
    expect(result.system).toContain('# 刺激源定义 (Stimulus)');
    expect(result.system).toContain('## 直播间');
    expect(result.system).not.toContain('## 语音');
    expect(result.system).toContain('# 回答约束');
    expect(result.system).toContain('不要暴露 Stimulus、Signal、Percept、Context、Nucleus');
    expect(result.system).toContain('只有用户明确询问系统内部机制时才可解释这些术语');
    expect(result.system).toContain('应用自定义设定');
    expect(result.system).toContain('# MEMORY');
    expect(result.system).toContain('用户喜欢简洁回答。');
    expect(result.system.indexOf('# Stimulus 与 Percept 解释')).toBeLessThan(
      result.system.indexOf('# 刺激源定义 (Stimulus)'),
    );
    expect(result.system.indexOf('# 刺激源定义 (Stimulus)')).toBeLessThan(
      result.system.indexOf('# 回答约束'),
    );
    expect(result.system.indexOf('# 回答约束')).toBeLessThan(
      result.system.indexOf('应用自定义设定'),
    );
    expect(result.system.indexOf('应用自定义设定')).toBeLessThan(result.system.indexOf('# MEMORY'));

    const serialized = JSON.stringify(result.messages);
    expect(serialized).toContain('# 本轮输入');
    expect(serialized).toContain('手动触发');
    expect(serialized).toContain('# 最近经历');
    expect(serialized).toContain('用户此前正在检查直播。');
    expect(serialized).toContain('# 对话 (Reading)');
    expect(serialized).toContain('## 场景中的文字消息');
    expect(serialized.match(/# 对话 \(Reading\)/g)).toHaveLength(1);
    expect(serialized).toContain('你好');
    expect(serialized).toContain('补充信息');
    expect(serialized).toContain('# 语音 (Hearing)');
    expect(serialized).toContain('## 识别后的语音');
    expect(serialized).not.toContain('不应读取的缓存');
    expect(serialized).toContain('[主播] 欢迎');
    expect(serialized.indexOf('你好')).toBeLessThan(serialized.indexOf('补充信息'));
    expect(serialized.indexOf('补充信息')).toBeLessThan(serialized.indexOf('欢迎'));
    expect(serialized.indexOf('你好')).toBeLessThan(serialized.indexOf('欢迎'));
    expect(serialized.indexOf('欢迎')).toBeLessThan(serialized.indexOf('当前任务'));
  });

  it('解释视觉拼图并使用 originSignal 元数据描述分组', async () => {
    const directory = await mkdtemp(path.join(tmpdir(), 'ciel-context-'));
    temporaryDirectories.push(directory);
    const imagePath = path.join(directory, 'contact-sheet.jpg');
    await writeFile(imagePath, Buffer.from('test image'));

    const stimulus = new TestStimulus();
    const context = new Context([...signals], [stimulus], new VisionProjector(4));
    const store = new InMemoryPerceptStore();
    store.register(stimulus);
    store.append(
      stimulus,
      new Sight({
        path: imagePath,
        startAt: new Date(100),
        endAt: new Date(900),
        originSignal: TestPhoton,
      }),
    );
    const input = {
      createdAt: new Date(1_000),
      data: store.snapshot().records,
      definitions: context.definitions,
      trigger: 'manual' as const,
    };

    const result = await context.build({ input, longTermMemory: '' });
    expect(result.system).toContain('# Stimulus 与 Percept 解释');
    expect(result.system).toContain('### Sight');
    expect(result.system).toContain('同一人物或物体可能在不同帧重复出现');
    expect(result.system).toContain('不代表存在多个不同的人或物体');

    const serialized = JSON.stringify(result.messages);
    expect(serialized).toContain('# 画面 (Sight)');
    expect(serialized).toContain('## 当前视觉画面');
    expect(serialized).toContain('1970-01-01T00:00:00.100Z - 1970-01-01T00:00:00.900Z');
    expect(serialized).toContain('image/jpeg');
  });
});
