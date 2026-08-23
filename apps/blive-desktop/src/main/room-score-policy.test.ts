import { describe, expect, it } from 'vite-plus/test';

import type { RoomEvaluation } from './room-score-policy.ts';
import { RoomScorePolicy } from './room-score-policy.ts';

describe('RoomScorePolicy', () => {
  it('连续两次极低评分后切换，但不响应单次波动', () => {
    const policy = new RoomScorePolicy();

    expect(policy.evaluate(evaluation({ score: 15 }))).toEqual({ shouldSwitch: false });
    expect(policy.evaluate(evaluation({ score: 20 }))).toEqual({
      reason: 'sustained-low-score',
      shouldSwitch: true,
    });
  });

  it('最近三次平均低分且至少两次高置信时切换', () => {
    const policy = new RoomScorePolicy();

    expect(policy.evaluate(evaluation({ confidence: 0.8, score: 45 }))).toEqual({
      shouldSwitch: false,
    });
    expect(policy.evaluate(evaluation({ confidence: 0.4, score: 35 }))).toEqual({
      shouldSwitch: false,
    });
    expect(policy.evaluate(evaluation({ confidence: 0.7, score: 40 }))).toEqual({
      reason: 'sustained-low-score',
      shouldSwitch: true,
    });
  });

  it('连续两次可信 explore 建议后切换', () => {
    const policy = new RoomScorePolicy();

    expect(policy.evaluate(evaluation({ action: 'explore', confidence: 0.8, score: 50 }))).toEqual({
      shouldSwitch: false,
    });
    expect(policy.evaluate(evaluation({ action: 'explore', confidence: 0.7, score: 45 }))).toEqual({
      reason: 'confirmed-explore',
      shouldSwitch: true,
    });
  });

  it('恢复到 60 分时清除累积低分', () => {
    const policy = new RoomScorePolicy();

    policy.evaluate(evaluation({ confidence: 0.8, score: 30 }));
    policy.evaluate(evaluation({ confidence: 0.8, score: 60 }));
    policy.evaluate(evaluation({ confidence: 0.8, score: 30 }));
    expect(policy.evaluate(evaluation({ confidence: 0.4, score: 50 }))).toEqual({
      shouldSwitch: false,
    });
  });

  it('作出切换决定后重置评分窗口', () => {
    const policy = new RoomScorePolicy();

    policy.evaluate(evaluation({ score: 10 }));
    policy.evaluate(evaluation({ score: 10 }));
    expect(policy.evaluate(evaluation({ score: 10 }))).toEqual({ shouldSwitch: false });
  });
});

function evaluation(overrides: Partial<RoomEvaluation> = {}): RoomEvaluation {
  return {
    action: 'stay',
    confidence: 0.8,
    evaluatedAt: Date.now(),
    score: 70,
    ...overrides,
  };
}
