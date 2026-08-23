import { describe, expect, it } from 'vite-plus/test';

import { VigiliaChannel } from './channel.ts';
import { VigiliaGroup } from './group.ts';
import { VigiliaOperations } from './operation.ts';
import type { VigiliaObservation } from './types.ts';

describe('Vigilia observability', () => {
  it('动态组合和移除模块观测源', () => {
    const group = new VigiliaGroup();
    const source = new VigiliaChannel();
    const observations: VigiliaObservation[] = [];
    group.subscribe(observation => observations.push(observation));

    const remove = group.add(source);
    source.emit('ciel.state.changed', { from: 'idle', to: 'starting' });
    remove();
    source.emit('ciel.state.changed', { from: 'starting', to: 'running' });

    expect(observations).toHaveLength(1);
    expect(observations[0]?.type).toBe('ciel.state.changed');
  });

  it('operation 只允许结算一次', () => {
    const channel = new VigiliaChannel();
    const observations: VigiliaObservation[] = [];
    channel.subscribe(observation => observations.push(observation));
    const operations = new VigiliaOperations(channel);

    const operation = operations.start({ category: 'memory', name: 'recall' });
    operation.complete(['result']);
    operation.fail(new Error('late failure'));
    operation.complete(['late result']);

    expect(observations.map(observation => observation.type)).toEqual([
      'operation.started',
      'operation.completed',
    ]);
  });
});
