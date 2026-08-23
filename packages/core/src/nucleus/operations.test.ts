import { describe, expect, it, vi } from 'vite-plus/test';

import { VigiliaChannel } from '#vigilia';
import type { VigiliaObservation } from '#vigilia';

import type { NucleusAgent } from './agent.ts';
import { NucleusOperations } from './operations.ts';

describe('NucleusOperations', () => {
  it('模型失败时结算已开始的子步骤和外层 operation', async () => {
    const observations: VigiliaObservation[] = [];
    const channel = new VigiliaChannel();
    channel.subscribe(observation => observations.push(observation));
    const operations = new NucleusOperations(channel);
    const generate = vi.fn(async (options: Parameters<NucleusAgent<string>['generate']>[0]) => {
      options.onStepStart?.({ stepNumber: 0 } as never);
      throw new Error('model failed');
    });
    const agent = { generate } as unknown as NucleusAgent<string>;

    await expect(
      operations.generate(
        'think-1',
        agent,
        { createdAt: new Date(0), data: [], definitions: [], trigger: 'manual' },
        { messages: [], system: 'system' },
      ),
    ).rejects.toThrow('model failed');

    const started = observations.flatMap(observation => {
      if (observation.type !== 'operation.started') return [];
      return [observation.data.name];
    });
    const failed = observations.flatMap(observation => {
      if (observation.type !== 'operation.failed') return [];
      return [observation.data.name];
    });
    expect(started).toEqual(['generate', 'choose-response-or-tools']);
    expect(failed).toEqual(['choose-response-or-tools', 'generate']);
  });
});
