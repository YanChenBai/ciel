import {
  DevtoolEventName,
  DevtoolProtocol,
  type DevtoolEvent,
  type DevtoolSnapshot,
} from '@ciels/devtool-protocol';
import { describe, expect, it } from 'vite-plus/test';

import { reduceDevtoolSnapshot } from '../src/session/snapshot.ts';

const snapshot: DevtoolSnapshot = {
  runtime: { status: 'idle', observedAt: 0 },
  telemetry: {
    throughSequence: 0,
    operations: 0,
    activeOperations: 0,
    failedOperations: 0,
  },
  engram: { size: 0, throughSequence: 0 },
  agent: { messages: 0, throughSequence: 0 },
  activeOperations: [],
};

function event<TEvent extends DevtoolEvent>(
  value: Omit<TEvent, 'protocol' | 'version' | 'id' | 'type' | 'cursor' | 'time'>,
  sequence: number,
): TEvent {
  return {
    protocol: DevtoolProtocol.Name,
    version: DevtoolProtocol.Version,
    id: `event-${sequence}`,
    type: 'event',
    cursor: { targetId: 'target-1', epoch: 'epoch-1', sequence },
    time: sequence * 10,
    ...value,
  } as TEvent;
}

describe('reduceDevtoolSnapshot', () => {
  it('归并 Operation 的开始、失败与活跃计数', () => {
    const operation = {
      id: 'operation-1',
      name: 'agent.think',
      category: 'agent' as const,
      startedAt: 10,
      status: 'running' as const,
      attributes: {},
      input: { type: 'omitted' as const, reason: 'capture-disabled' as const },
      output: { type: 'omitted' as const, reason: 'capture-disabled' as const },
    };
    const started = reduceDevtoolSnapshot(
      snapshot,
      event({ name: DevtoolEventName.OperationStarted, payload: { operation } }, 1),
    );
    const failed = reduceDevtoolSnapshot(
      started,
      event(
        {
          name: DevtoolEventName.OperationFailed,
          payload: {
            operation: {
              ...operation,
              status: 'failed',
              completedAt: 20,
              durationMs: 10,
            },
          },
        },
        2,
      ),
    );

    expect(started.telemetry).toMatchObject({ operations: 1, activeOperations: 1 });
    expect(started.activeOperations).toHaveLength(1);
    expect(failed.telemetry).toMatchObject({ activeOperations: 0, failedOperations: 1 });
    expect(failed.activeOperations).toEqual([]);
  });

  it('用事件载荷更新 Runtime、Engram 与 Agent 摘要', () => {
    const running = reduceDevtoolSnapshot(
      snapshot,
      event(
        {
          name: DevtoolEventName.RuntimeStatusChanged,
          payload: { previous: 'idle', status: 'running' },
        },
        1,
      ),
    );
    const engram = reduceDevtoolSnapshot(
      running,
      event(
        {
          name: DevtoolEventName.EngramAppended,
          payload: { entries: [] },
        },
        2,
      ),
    );
    const agent = reduceDevtoolSnapshot(
      engram,
      event(
        {
          name: DevtoolEventName.AgentMessagesReset,
          payload: { summary: { messages: 3, throughSequence: 7 } },
        },
        3,
      ),
    );

    expect(running.runtime).toEqual({ status: 'running', observedAt: 10 });
    expect(engram.engram).toEqual({ size: 0, throughSequence: 0 });
    expect(agent.agent).toEqual({ messages: 3, throughSequence: 7 });
  });
});
