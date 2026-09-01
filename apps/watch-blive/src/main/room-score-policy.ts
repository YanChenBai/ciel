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

export class RoomScorePolicy {
  private evaluations: RoomEvaluation[] = [];

  evaluate(input: RoomEvaluation): RoomSwitchDecision {
    if (input.score >= 60) {
      this.reset();
      return NO_SWITCH;
    }

    this.evaluations.push(input);
    if (this.evaluations.length > 3) this.evaluations.shift();

    const recentTwo = this.evaluations.slice(-2);
    if (recentTwo.length === 2 && recentTwo.every(item => item.score <= 20)) {
      return this.switch('sustained-low-score');
    }

    if (
      recentTwo.length === 2 &&
      recentTwo.every(
        item => item.action === 'explore' && item.score <= 50 && item.confidence >= 0.7,
      )
    ) {
      return this.switch('confirmed-explore');
    }

    if (this.evaluations.length === 3) {
      const average =
        this.evaluations.reduce((sum, item) => sum + item.score, 0) / this.evaluations.length;
      const confident = this.evaluations.filter(item => item.confidence >= 0.6).length;
      if (average <= 40 && confident >= 2) return this.switch('sustained-low-score');
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
