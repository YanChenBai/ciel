import {
  ROOM_SCORE_CRITICAL_THRESHOLD,
  ROOM_SCORE_EXPLORE_CONFIDENCE,
  ROOM_SCORE_EXPLORE_THRESHOLD,
  ROOM_SCORE_LOW_CONFIDENCE,
  ROOM_SCORE_LOW_THRESHOLD,
  ROOM_SCORE_RECOVERY_THRESHOLD,
} from './constants.ts';

export interface RoomEvaluation {
  readonly action: 'explore' | 'stay';
  readonly confidence: number;
  readonly evaluatedAt: number;
  readonly score: number;
}

export interface RoomSwitchDecision {
  readonly reason?: 'confirmed-explore' | 'sustained-low-score';
  readonly shouldSwitch: boolean;
}

const NO_SWITCH: RoomSwitchDecision = { shouldSwitch: false };

/** 用连续评分和恢复滞回把模型评价转换为确定性的换房决定。 */
export class RoomScorePolicy {
  private evaluations: RoomEvaluation[] = [];

  evaluate(input: RoomEvaluation): RoomSwitchDecision {
    if (input.score >= ROOM_SCORE_RECOVERY_THRESHOLD) {
      this.reset();
      return NO_SWITCH;
    }

    this.evaluations.push(input);
    if (this.evaluations.length > 3) this.evaluations.shift();

    const recentTwo = this.evaluations.slice(-2);
    if (
      recentTwo.length === 2 &&
      recentTwo.every(item => item.score <= ROOM_SCORE_CRITICAL_THRESHOLD)
    ) {
      return this.switch('sustained-low-score');
    }

    if (
      recentTwo.length === 2 &&
      recentTwo.every(
        item =>
          item.action === 'explore' &&
          item.score <= ROOM_SCORE_EXPLORE_THRESHOLD &&
          item.confidence >= ROOM_SCORE_EXPLORE_CONFIDENCE,
      )
    ) {
      return this.switch('confirmed-explore');
    }

    if (this.evaluations.length === 3) {
      const averageScore =
        this.evaluations.reduce((sum, item) => sum + item.score, 0) / this.evaluations.length;
      const confidentEvaluations = this.evaluations.filter(
        item => item.confidence >= ROOM_SCORE_LOW_CONFIDENCE,
      ).length;
      if (averageScore <= ROOM_SCORE_LOW_THRESHOLD && confidentEvaluations >= 2) {
        return this.switch('sustained-low-score');
      }
    }

    return NO_SWITCH;
  }

  reset(): void {
    this.evaluations = [];
  }

  private switch(reason: NonNullable<RoomSwitchDecision['reason']>): RoomSwitchDecision {
    this.reset();
    return { reason, shouldSwitch: true };
  }
}
