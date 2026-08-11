import { describe, expect, it } from 'vite-plus/test';

import { Hearing, Reading, Sight } from '#src/percepts/index.ts';
import { Echo, Photon, Script } from '#src/signals/index.ts';
import { Stimulus } from '#src/stimulus/index.ts';

import { Context } from './context.ts';

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

describe('Context', () => {
  it('根据 Stimulus 和 Signal 构建 system', () => {
    const stimulus = new TestStimulus();
    const context = new Context([...signals], [stimulus]);

    expect(context.systemBuilder()).toBe(
      [
        '# 基础定义',
        '',
        '## 直播间',
        '持续发生视听互动的场景',
        '',
        '## 语音',
        '识别后的语音',
        '',
        '## 画面',
        '当前视觉画面',
        '',
        '## 对话',
        '场景中的文字消息',
      ].join('\n'),
    );
  });

  it('按时间构建文字、说话人与图片消息', () => {
    const context = new Context([...signals], [new TestStimulus()]);
    const parts = context.messageBuilder([
      new Sight({
        path: 'scene.jpg',
        startAt: new Date(300),
        endAt: new Date(300),
        originSignal: TestPhoton,
      }),
      new Reading({ content: '你好', timestamp: new Date(100), originSignal: TestScript }),
      new Hearing({
        content: '欢迎',
        speaker: '主播',
        startAt: new Date(200),
        endAt: new Date(250),
        originSignal: TestEcho,
      }),
    ]);

    expect(parts).toEqual([
      {
        type: 'text',
        text: [
          '# 基础数据',
          '',
          '[对话]',
          '[1970-01-01T00:00:00.100Z] 你好',
          '',
          '[语音]',
          '[1970-01-01T00:00:00.200Z - 1970-01-01T00:00:00.250Z] [主播] 欢迎',
          '',
          '[画面]',
          '[1970-01-01T00:00:00.300Z]',
        ].join('\n'),
      },
      { type: 'image', path: 'scene.jpg' },
    ]);
  });
});
