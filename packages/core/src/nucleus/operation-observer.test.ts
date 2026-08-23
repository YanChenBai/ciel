import { describe, expect, it, vi } from 'vite-plus/test';

import type { NucleusAgent } from './agent.ts';
import { NucleusOperationObserver } from './operation-observer.ts';
import type {
  NucleusObservedOperationCompleted,
  NucleusObservedOperationFailed,
  NucleusObservedOperationStarted,
} from './types.ts';

describe('NucleusOperationObserver', () => {
  it('模型失败时结算已开始的子步骤和外层 operation', async () => {
    const completed: NucleusObservedOperationCompleted[] = [];
    const failed: NucleusObservedOperationFailed[] = [];
    const started: NucleusObservedOperationStarted[] = [];
    const observer = new NucleusOperationObserver({
      completed: event => completed.push(event),
      failed: event => failed.push(event),
      started: event => started.push(event),
    });
    const generate = vi.fn(async (options: Parameters<NucleusAgent<string>['generate']>[0]) => {
      options.onStepStart?.({ stepNumber: 0 } as never);
      throw new Error('model failed');
    });
    const agent = { generate } as unknown as NucleusAgent<string>;

    await expect(
      observer.generate(
        'think-1',
        agent,
        { createdAt: new Date(0), data: [], definitions: [], trigger: 'manual' },
        { messages: [], system: 'system' },
      ),
    ).rejects.toThrow('model failed');

    expect(started.map(operation => operation.name)).toEqual([
      'generate',
      'choose-response-or-tools',
    ]);
    expect(failed.map(operation => operation.name)).toEqual([
      'choose-response-or-tools',
      'generate',
    ]);
    expect(completed).toEqual([]);
  });
});
