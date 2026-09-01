import { describe, expect, it } from 'vite-plus/test';

import type { RoomEvaluation } from './room-score-policy.ts';
import { RoomScorePolicy } from './room-score-policy.ts';

describe('RoomScorePolicy', () => {
  it('requires sustained low scores before switching', () => {
    const policy = new RoomScorePolicy();

    expect(policy.evaluate(evaluation({ score: 15 }))).toEqual({ shouldSwitch: false });
    expect(policy.evaluate(evaluation({ score: 20 }))).toEqual({
      reason: 'sustained-low-score',
      shouldSwitch: true,
    });
  });

  it('requires two confident explore decisions', () => {
    const policy = new RoomScorePolicy();

    expect(policy.evaluate(evaluation({ action: 'explore', score: 50 }))).toEqual({
      shouldSwitch: false,
    });
    expect(policy.evaluate(evaluation({ action: 'explore', confidence: 0.7, score: 45 }))).toEqual({
      reason: 'confirmed-explore',
      shouldSwitch: true,
    });
  });

  it('clears accumulated scores after recovery', () => {
    const policy = new RoomScorePolicy();

    policy.evaluate(evaluation({ score: 30 }));
    policy.evaluate(evaluation({ score: 60 }));
    policy.evaluate(evaluation({ score: 30 }));
    expect(policy.evaluate(evaluation({ confidence: 0.4, score: 50 }))).toEqual({
      shouldSwitch: false,
    });
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
