import { describe, expect, it } from 'vite-plus/test';

import { Echo, Photon } from '#signals';
import { VigiliaChannel } from '#vigilia';
import type { VigiliaObservation } from '#vigilia';

import { SensusOperations } from './operations.ts';

class LiveEcho extends Echo.WithMeta({
  description: '测试中文显示名称不参与 operation 分类',
  name: '直播声音',
}) {}

class LivePhoton extends Photon.WithMeta({
  description: '测试原始图像摄取与视觉合成分离',
  name: '直播画面',
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

  it('把 Photon 标记为原始图像摄取，而不是视觉合成', async () => {
    const channel = new VigiliaChannel();
    const observations: VigiliaObservation[] = [];
    channel.subscribe(observation => observations.push(observation));
    const operations = new SensusOperations(channel);

    await operations.process(
      new LivePhoton({ data: Buffer.alloc(0), timestamp: new Date(0) }),
      async () => Promise.resolve(),
    );

    const started = observations.find(observation => observation.type === 'operation.started');
    expect(started?.type).toBe('operation.started');
    if (started?.type !== 'operation.started') return;
    expect(started.data.name).toBe('image-ingest');
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
