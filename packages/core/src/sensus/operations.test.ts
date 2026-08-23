import { describe, expect, it } from 'vite-plus/test';

import { Echo } from '#signals';
import { VigiliaChannel } from '#vigilia';
import type { VigiliaObservation } from '#vigilia';

import { SensusOperations } from './operations.ts';

class LiveEcho extends Echo.WithMeta({
  description: '测试中文显示名称不参与 operation 分类',
  name: '直播声音',
}) {}

describe('SensusOperations', () => {
  it('根据信号类型产生稳定 operation 名称', async () => {
    const channel = new VigiliaChannel();
    const observations: VigiliaObservation[] = [];
    channel.subscribe(observation => observations.push(observation));
    const operations = new SensusOperations(channel);
    const echo = new LiveEcho({
      data: Buffer.alloc(0),
      endAt: new Date(1),
      startAt: new Date(0),
    });

    await operations.process(echo, async () => Promise.resolve());

    const started = observations.find(observation => observation.type === 'operation.started');
    expect(started?.type).toBe('operation.started');
    if (started?.type !== 'operation.started') return;
    expect(started.data.name).toBe('audio-ingest');
  });

  it('关闭时结算未完成 ASR，并允许创建下一段语音', () => {
    const channel = new VigiliaChannel();
    const observations: VigiliaObservation[] = [];
    channel.subscribe(observation => observations.push(observation));
    const operations = new SensusOperations(channel);

    operations.startAsr(new Date(0));
    operations.cancelAsr();
    operations.startAsr(new Date(10));
    operations.completeAsr(new Date(20));

    const starts = observations.filter(observation => {
      return observation.type === 'operation.started' && observation.data.name === 'asr';
    });
    expect(starts).toHaveLength(2);
    expect(observations.some(observation => observation.type === 'operation.failed')).toBe(true);
    expect(observations.some(observation => observation.type === 'operation.completed')).toBe(true);
  });
});
